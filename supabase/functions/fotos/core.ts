import jpeg from 'jpeg-js';

export const MAX_BYTES = 300 * 1024;
export type Caminhos = { caminho: string; caminho_mini: string };
export type Resultado = { codigo: string; estado?: string; ocultada?: boolean };

export function recodificarJpeg(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes.length > MAX_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new Error('invalido');
  }
  try {
    const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 16 });
    if (!decoded.width || !decoded.height) throw new Error('invalido');
    const encoded = new Uint8Array(jpeg.encode({ data: decoded.data, width: decoded.width, height: decoded.height }, 80).data);
    if (encoded.length > MAX_BYTES) throw new Error('invalido');
    return encoded;
  } catch {
    throw new Error('invalido');
  }
}

export interface Adaptador {
  usuario(token: string): Promise<string | null>;
  fotoParaPromover(fotoId: string, deviceId: string): Promise<(Caminhos & Resultado) | null>;
  registrarPromocao(fotoId: string, deviceId: string): Promise<Resultado & { cache_segundos: number; arquivada?: Caminhos | null }>;
  registrarRemocao(fotoId: string, deviceId?: string): Promise<Resultado>;
  denunciar(fotoId: string, clientUuid: string, clientTs: string, token: string): Promise<Resultado>;
  fotoParaMover(fotoId: string): Promise<(Caminhos & Resultado & { estado: string; cache_segundos?: number }) | null>;
  fotoDoDono(fotoId: string, deviceId: string): Promise<(Caminhos & Resultado & { estado: string }) | null>;
  registrarOcultacao(fotoId: string): Promise<Resultado>;
  registrarRestauracao(fotoId: string): Promise<Resultado & { arquivada?: Caminhos | null }>;
  pendentes(): Promise<Array<{ id: string; bucket: string; caminho: string }>>;
  confirmarApagado(id: string): Promise<void>;
  baixar(bucket: string, caminho: string): Promise<Uint8Array>;
  gravar(bucket: string, caminho: string, bytes: Uint8Array, cache: number): Promise<void>;
  apagar(bucket: string, caminho: string): Promise<void>;
  mover(origem: string, destino: string, caminho: string, cache?: number): Promise<void>;
  assinar(bucket: string, caminho: string, segundos: number): Promise<string>;
}

export async function promover(a: Adaptador, token: string, fotoId: string): Promise<Resultado> {
  const deviceId = await a.usuario(token);
  if (!deviceId) return { codigo: 'invalido' };
  const foto = await a.fotoParaPromover(fotoId, deviceId);
  if (!foto || foto.codigo !== 'ok') return { codigo: 'invalido' };
  let imagem: Uint8Array, mini: Uint8Array;
  try {
    imagem = recodificarJpeg(await a.baixar('fotos_fila', foto.caminho));
    mini = recodificarJpeg(await a.baixar('fotos_fila', foto.caminho_mini));
  } catch {
    await a.apagar('fotos_fila', foto.caminho);
    await a.apagar('fotos_fila', foto.caminho_mini);
    await a.registrarRemocao(fotoId, deviceId);
    return { codigo: 'invalido' };
  }
  const decisao = await a.registrarPromocao(fotoId, deviceId);
  if (decisao.codigo !== 'ok') return { codigo: 'invalido' };
  const destino = decisao.estado === 'visivel' ? 'fotos' : 'fotos_arquivo';
  const caminhoDestino = decisao.estado === 'visivel' ? `${fotoId}.jpg` : foto.caminho;
  const miniDestino = decisao.estado === 'visivel' ? `${fotoId}_mini.jpg` : foto.caminho_mini;
  await a.gravar(destino, caminhoDestino, imagem, decisao.cache_segundos);
  await a.gravar(destino, miniDestino, mini, decisao.cache_segundos);
  await a.apagar('fotos_fila', foto.caminho);
  await a.apagar('fotos_fila', foto.caminho_mini);
  if (decisao.arquivada) {
    await a.mover('fotos', 'fotos_arquivo', decisao.arquivada.caminho);
    await a.mover('fotos', 'fotos_arquivo', decisao.arquivada.caminho_mini);
  }
  return { codigo: 'ok', estado: decisao.estado };
}

export async function denunciar(a: Adaptador, token: string, fotoId: string, clientUuid: string, clientTs: string): Promise<Resultado> {
  const deviceId = await a.usuario(token);
  if (!deviceId) return { codigo: 'invalido' };
  const resultado = await a.denunciar(fotoId, clientUuid, clientTs, token);
  if (resultado.codigo !== 'ok' || !resultado.ocultada) return resultado;
  const foto = await a.fotoParaMover(fotoId);
  if (!foto || foto.estado !== 'quarentena') throw new Error('invalido');
  await a.mover('fotos', 'fotos_quarentena', foto.caminho);
  await a.mover('fotos', 'fotos_quarentena', foto.caminho_mini);
  return resultado;
}

export async function ocultar(a: Adaptador, fotoId: string): Promise<Resultado> {
  const foto = await a.fotoParaMover(fotoId);
  if (!foto || foto.estado !== 'visivel') return { codigo: 'invalido' };
  await a.mover('fotos', 'fotos_quarentena', foto.caminho);
  await a.mover('fotos', 'fotos_quarentena', foto.caminho_mini);
  return a.registrarOcultacao(fotoId);
}

export async function restaurar(a: Adaptador, fotoId: string): Promise<Resultado> {
  const foto = await a.fotoParaMover(fotoId);
  if (!foto || foto.estado !== 'quarentena') return { codigo: 'invalido' };
  await a.mover('fotos_quarentena', 'fotos', foto.caminho, foto.cache_segundos ?? 86400);
  await a.mover('fotos_quarentena', 'fotos', foto.caminho_mini, foto.cache_segundos ?? 86400);
  const resultado = await a.registrarRestauracao(fotoId);
  if (resultado.arquivada) {
    await a.mover('fotos', 'fotos_arquivo', resultado.arquivada.caminho);
    await a.mover('fotos', 'fotos_arquivo', resultado.arquivada.caminho_mini);
  }
  return resultado;
}

export async function remover(a: Adaptador, token: string, fotoId: string): Promise<Resultado> {
  const deviceId = await a.usuario(token);
  if (!deviceId) return { codigo: 'invalido' };
  const foto = await a.fotoDoDono(fotoId, deviceId);
  if (!foto || foto.codigo !== 'ok') return { codigo: 'invalido' };
  const resultado = await a.registrarRemocao(fotoId, deviceId);
  if (resultado.codigo !== 'ok') return resultado;
  const bucket = foto.estado === 'fila' ? 'fotos_fila'
    : foto.estado === 'visivel' ? 'fotos'
    : foto.estado === 'quarentena' ? 'fotos_quarentena' : 'fotos_arquivo';
  await a.apagar(bucket, foto.caminho);
  await a.apagar(bucket, foto.caminho_mini);
  return resultado;
}

export async function urlsAdmin(a: Adaptador, fotoId: string): Promise<Resultado & { url?: string; miniatura_url?: string }> {
  const foto = await a.fotoParaMover(fotoId);
  if (!foto || !['quarentena', 'revisao', 'arquivada'].includes(foto.estado)) return { codigo: 'invalido' };
  const bucket = foto.estado === 'quarentena' ? 'fotos_quarentena' : 'fotos_arquivo';
  const url = await a.assinar(bucket, foto.caminho, 60);
  const miniatura_url = await a.assinar(bucket, foto.caminho_mini, 60);
  return { codigo: 'ok', url, miniatura_url };
}

export async function limpar(a: Adaptador): Promise<Resultado> {
  for (;;) {
    const itens = await a.pendentes();
    if (!itens.length) break;
    for (const item of itens) {
      await a.apagar(item.bucket, item.caminho);
      await a.confirmarApagado(item.id);
    }
  }
  return { codigo: 'ok' };
}
