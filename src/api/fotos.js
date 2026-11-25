import {
  backendAtivo, chamarRpc, garantirSessao, lerTabelaPublica, privacidadeAceita, resultadoDeErro,
  CODIGO_PRIVACIDADE_PENDENTE, SUPABASE_ANON_KEY, SUPABASE_URL,
} from './client.js';
import { gerarUuid } from './confirmacoesFila.js';

const offline = { codigo: 'sem_conexao', offline: true };
const acesso = () => privacidadeAceita() ? null : { codigo: CODIGO_PRIVACIDADE_PENDENTE };
const erroDaChamada = (erro) => resultadoDeErro(erro)
  ?? (erro instanceof TypeError ? offline : { codigo: 'servidor' });

async function chamarFuncao(rota, payload, captchaToken) {
  const sessao = await garantirSessao(captchaToken);
  if (!sessao?.access_token) return { codigo: 'servidor' };
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/fotos/${rota}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${sessao.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch { return offline; }
  if (!res.ok) return { codigo: 'servidor' };
  try {
    const dados = await res.json();
    if (!dados?.codigo || dados.codigo === 'invalido'
      || (rota === 'promover' && (dados.codigo !== 'ok' || dados.estado !== 'visivel'))) {
      return { codigo: 'servidor' };
    }
    return dados;
  } catch { return { codigo: 'servidor' }; }
}

export async function pedirUpload({ feiraId, feira_id, lat, lng, acuracia, captchaToken } = {}) {
  if (!backendAtivo) return { codigo: 'servidor', localOnly: true };
  if (acesso()) return acesso();
  try {
    return await chamarRpc('pedir_upload_foto', {
      feira_id: feiraId ?? feira_id, lat, lng, acuracia,
      client_uuid: gerarUuid(), client_ts: new Date().toISOString(),
    }, { autenticado: true, captchaToken });
  } catch (e) { return erroDaChamada(e); }
}

async function subir(caminho, blob, token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/fotos_fila/${caminho}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'false' },
      body: blob,
    });
    return res.ok ? null : { codigo: 'upload_falhou' };
  } catch { return offline; }
}

export async function enviarFoto({ fotoId, foto_id, caminho, caminhoMini, caminho_mini, foto, miniatura, captchaToken } = {}) {
  if (!backendAtivo) return { codigo: 'servidor', localOnly: true };
  if (acesso()) return acesso();
  if (typeof (fotoId ?? foto_id) !== 'string' || typeof caminho !== 'string' || typeof (caminhoMini ?? caminho_mini) !== 'string'
    || !(foto instanceof Blob) || !(miniatura instanceof Blob) || foto.type !== 'image/jpeg' || miniatura.type !== 'image/jpeg'
    || foto.size > 307200 || miniatura.size > 307200) return { codigo: 'invalido' };
  try {
    const sessao = await garantirSessao(captchaToken);
    if (!sessao?.access_token) return { codigo: 'servidor' };
    const erroFoto = await subir(caminho, foto, sessao.access_token);
    if (erroFoto) return erroFoto;
    const erroMiniatura = await subir(caminhoMini ?? caminho_mini, miniatura, sessao.access_token);
    if (erroMiniatura) return erroMiniatura;
    return await chamarFuncao('promover', { foto_id: fotoId ?? foto_id }, captchaToken);
  } catch (e) { return erroDaChamada(e); }
}

export async function denunciarFoto({ fotoId, foto_id, captchaToken } = {}) {
  if (!backendAtivo) return { codigo: 'servidor', localOnly: true };
  if (acesso()) return acesso();
  try {
    return await chamarFuncao('denunciar', {
      foto_id: fotoId ?? foto_id, client_uuid: gerarUuid(), client_ts: new Date().toISOString(),
    }, captchaToken);
  } catch (e) { return erroDaChamada(e); }
}

export async function apagarFoto({ fotoId, foto_id, captchaToken } = {}) {
  if (!backendAtivo) return { codigo: 'servidor', localOnly: true };
  if (acesso()) return acesso();
  try { return await chamarFuncao('remover', { foto_id: fotoId ?? foto_id }, captchaToken); }
  catch (e) { return erroDaChamada(e); }
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
