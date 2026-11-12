import {
  backendAtivo, chamarRpc, garantirSessao, lerTabelaPublica, privacidadeAceita,
  CODIGO_PRIVACIDADE_PENDENTE, SUPABASE_ANON_KEY, SUPABASE_URL,
} from './client.js';
import { gerarUuid } from './confirmacoesFila.js';

const offline = { codigo: 'sem_conexao', offline: true };
const acesso = () => privacidadeAceita() ? null : { codigo: CODIGO_PRIVACIDADE_PENDENTE };

async function chamarFuncao(rota, payload, captchaToken) {
  const sessao = await garantirSessao(captchaToken);
  if (!sessao?.access_token) return { codigo: 'invalido' };
  const res = await fetch(`${SUPABASE_URL}/functions/v1/fotos/${rota}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${sessao.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { codigo: 'invalido' };
  return res.json();
}

export async function pedirUpload({ feiraId, feira_id, lat, lng, acuracia, captchaToken } = {}) {
  if (!backendAtivo) return { codigo: 'invalido', localOnly: true };
  if (acesso()) return acesso();
  try {
    return await chamarRpc('pedir_upload_foto', {
      feira_id: feiraId ?? feira_id, lat, lng, acuracia,
      client_uuid: gerarUuid(), client_ts: new Date().toISOString(),
    }, { autenticado: true, captchaToken });
  } catch { return offline; }
}

async function subir(caminho, blob, token) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/fotos_fila/${caminho}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'false' },
    body: blob,
  });
  return res.ok;
}

export async function enviarFoto({ fotoId, foto_id, caminho, caminhoMini, caminho_mini, foto, miniatura, captchaToken } = {}) {
  if (!backendAtivo) return { codigo: 'invalido', localOnly: true };
  if (acesso()) return acesso();
  if (typeof (fotoId ?? foto_id) !== 'string' || typeof caminho !== 'string' || typeof (caminhoMini ?? caminho_mini) !== 'string'
    || !(foto instanceof Blob) || !(miniatura instanceof Blob) || foto.type !== 'image/jpeg' || miniatura.type !== 'image/jpeg'
    || foto.size > 307200 || miniatura.size > 307200) return { codigo: 'invalido' };
  try {
    const sessao = await garantirSessao(captchaToken);
    if (!sessao?.access_token) return { codigo: 'invalido' };
    if (!await subir(caminho, foto, sessao.access_token)) return { codigo: 'invalido' };
    if (!await subir(caminhoMini ?? caminho_mini, miniatura, sessao.access_token)) return { codigo: 'invalido' };
    return await chamarFuncao('promover', { foto_id: fotoId ?? foto_id }, captchaToken);
  } catch { return offline; }
}

export async function denunciarFoto({ fotoId, foto_id, captchaToken } = {}) {
  if (!backendAtivo) return { codigo: 'invalido', localOnly: true };
  if (acesso()) return acesso();
  try {
    return await chamarFuncao('denunciar', {
      foto_id: fotoId ?? foto_id, client_uuid: gerarUuid(), client_ts: new Date().toISOString(),
    }, captchaToken);
  } catch { return offline; }
}

export async function apagarFoto({ fotoId, foto_id, captchaToken } = {}) {
  if (!backendAtivo) return { codigo: 'invalido', localOnly: true };
  if (acesso()) return acesso();
  try { return await chamarFuncao('remover', { foto_id: fotoId ?? foto_id }, captchaToken); }
  catch { return offline; }
}

export async function lerFotos(feiraId) {
  if (!backendAtivo) return [];
  const filtro = feiraId == null ? 'select=id,feira_id,caminho,caminho_mini,criado_em&order=criado_em.desc'
    : `select=id,feira_id,caminho,caminho_mini,criado_em&feira_id=eq.${encodeURIComponent(String(feiraId))}&order=criado_em.desc`;
  const fotos = await lerTabelaPublica('pub_fotos', filtro);
  const base = `${SUPABASE_URL}/storage/v1/object/public/fotos/`;
  const url = (caminho) => base + caminho.split('/').map(encodeURIComponent).join('/');
  return fotos.map((foto) => ({
    id: foto.id, feiraId: foto.feira_id, criadoEm: foto.criado_em,
    url: url(foto.caminho), miniaturaUrl: url(foto.caminho_mini),
  }));
}
