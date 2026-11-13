import jpeg from 'jpeg-js';
import { MAX_BYTES, denunciar, limpar, ocultar, promover, recodificarJpeg, remover, restaurar, urlsAdmin, type Adaptador } from './core.ts';

function igual<T>(a: T, b: T) { if (a !== b) throw new Error(`esperado ${String(b)}, obtido ${String(a)}`); }
function jpegTeste() {
  return new Uint8Array(jpeg.encode({ data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]), width: 2, height: 2 }, 80).data);
}
const jpegOk = jpegTeste();

Deno.test('bytes mágicos, PNG, disfarce e 301 KB são recusados', () => {
  for (const bytes of [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    new Uint8Array([0xff, 0xd8, 0xff, 0x89, 0x50, 0x4e, 0x47]),
    new Uint8Array(301 * 1024).fill(0xff),
  ]) {
    let recusou = false;
    try { recodificarJpeg(bytes); } catch { recusou = true; }
    igual(recusou, true);
  }
  igual(MAX_BYTES, 307200);
});

Deno.test('recodificação remove APP1 EXIF da foto e da miniatura', () => {
  const exif = new Uint8Array([0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x47, 0x50, 0x53, 0x2d, 0x54, 0x45, 0x53, 0x54]);
  const comExif = new Uint8Array(jpegOk.length + exif.length);
  comExif.set(jpegOk.slice(0, 2)); comExif.set(exif, 2); comExif.set(jpegOk.slice(2), 2 + exif.length);
  for (const bytes of [comExif, comExif]) {
    const limpo = recodificarJpeg(bytes);
    igual(limpo[0], 0xff); igual(limpo[1], 0xd8);
    igual(new TextDecoder().decode(limpo).includes('Exif'), false);
    igual(new TextDecoder().decode(limpo).includes('GPS-TEST'), false);
  }
});

function falso(eventos: string[], estado: 'revisao' | 'visivel' = 'visivel', arquivada = false): Adaptador {
  return {
    usuario: async () => 'device',
    fotoParaPromover: async () => ({ codigo: 'ok', caminho: 'device/a.jpg', caminho_mini: 'device/a_mini.jpg' }),
    registrarPromocao: async () => ({ codigo: 'ok', estado, cache_segundos: 86400,
      arquivada: arquivada ? { caminho: 'device/old.jpg', caminho_mini: 'device/old_mini.jpg' } : null }),
    registrarRemocao: async () => ({ codigo: 'ok' }),
    denunciar: async () => ({ codigo: 'ok', ocultada: true }),
    fotoParaMover: async () => ({ codigo: 'ok', estado: 'visivel', caminho: 'device/a.jpg', caminho_mini: 'device/a_mini.jpg' }),
    fotoDoDono: async () => ({ codigo: 'ok', estado: 'visivel', caminho: 'a.jpg', caminho_mini: 'a_mini.jpg' }),
    registrarOcultacao: async () => { eventos.push('sql'); return { codigo: 'ok' }; },
    registrarRestauracao: async () => ({ codigo: 'ok' }),
    pendentes: async () => [], confirmarApagado: async () => {},
    baixar: async () => jpegOk,
    gravar: async (bucket) => { eventos.push(`gravar:${bucket}`); },
    apagar: async () => {},
    mover: async (de, para) => { eventos.push(`${de}->${para}`); },
    assinar: async (_bucket, _caminho, segundos) => { igual(segundos, 60); return 'https://privado'; },
  };
}

Deno.test('revisão só grava no privado; visível grava no público e arquiva o excedente do limite 12', async () => {
  const revisao: string[] = [];
  igual((await promover(falso(revisao, 'revisao'), 'token', 'foto')).estado, 'revisao');
  igual(revisao.join(','), 'gravar:fotos_arquivo,gravar:fotos_arquivo');
  const visivel: string[] = [];
  igual((await promover(falso(visivel, 'visivel', true), 'token', 'foto')).estado, 'visivel');
  igual(visivel.join(','), 'gravar:fotos,gravar:fotos,fotos->fotos_arquivo,fotos->fotos_arquivo');
});

Deno.test('ocultar move foto e mini antes da resposta e da transição SQL', async () => {
  const eventos: string[] = [];
  const a = falso(eventos);
  igual((await ocultar(a, 'foto')).codigo, 'ok');
  igual(eventos.join(','), 'fotos->fotos_quarentena,fotos->fotos_quarentena,sql');
});

Deno.test('denúncia decisiva só retorna depois de mover os dois arquivos', async () => {
  const eventos: string[] = [];
  const a = falso(eventos);
  a.fotoParaMover = async () => ({ codigo: 'ok', estado: 'quarentena', caminho: 'a.jpg', caminho_mini: 'a_mini.jpg' });
  const resultado = await denunciar(a, 'token', 'foto', 'uuid', new Date().toISOString());
  igual(resultado.ocultada, true);
  igual(eventos.join(','), 'fotos->fotos_quarentena,fotos->fotos_quarentena');
});

Deno.test('dono remove os dois arquivos e outra pessoa é recusada', async () => {
  const eventos: string[] = [];
  const a = falso(eventos);
  a.registrarRemocao = async () => { eventos.push('sql'); return { codigo: 'ok' }; };
  a.apagar = async () => { eventos.push('apagar'); };
  igual((await remover(a, 'token', 'foto')).codigo, 'ok');
  igual(eventos.join(','), 'sql,apagar,apagar');
  a.fotoDoDono = async () => ({ codigo: 'invalido', estado: 'visivel', caminho: '', caminho_mini: '' });
  igual((await remover(a, 'token', 'foto')).codigo, 'invalido');
});

Deno.test('restauração move do privado antes de republicar', async () => {
  const eventos: string[] = [];
  const a = falso(eventos);
  a.fotoParaMover = async () => ({ codigo: 'ok', estado: 'quarentena', caminho: 'a.jpg', caminho_mini: 'a_mini.jpg' });
  a.registrarRestauracao = async () => { eventos.push('sql'); return { codigo: 'ok' }; };
  igual((await restaurar(a, 'foto')).codigo, 'ok');
  igual(eventos.join(','), 'fotos_quarentena->fotos,fotos_quarentena->fotos,sql');
});

Deno.test('admin só recebe URLs assinadas de privados por 60 segundos', async () => {
  const a = falso([]);
  igual((await urlsAdmin(a, 'foto')).codigo, 'invalido');
  a.fotoParaMover = async () => ({ codigo: 'ok', estado: 'quarentena', caminho: 'a.jpg', caminho_mini: 'a_mini.jpg' });
  igual((await urlsAdmin(a, 'foto')).miniatura_url, 'https://privado');
});

Deno.test('limpeza processa todos os lotes e confirma cada objeto', async () => {
  const eventos: string[] = [];
  const a = falso(eventos);
  let lote = 0;
  a.pendentes = async () => lote++ < 2 ? [{ id: String(lote), bucket: 'fotos_arquivo', caminho: `${lote}.jpg` }] : [];
  a.apagar = async () => { eventos.push('apagar'); };
  a.confirmarApagado = async () => { eventos.push('confirmar'); };
  igual((await limpar(a)).codigo, 'ok');
  igual(eventos.join(','), 'apagar,confirmar,apagar,confirmar');
});
