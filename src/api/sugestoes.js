// RPCs de sugestões e lembrança local do voto para permitir trocá-lo na tela.
import { backendAtivo, chamarRpc, CODIGO_PRIVACIDADE_PENDENTE, privacidadeAceita } from './client.js';
import { gerarUuid } from './confirmacoesFila.js';

const SEM_CONEXAO = 'Sem conexão. Tente de novo quando a internet voltar.';
export const CHAVE_VOTOS_SUGESTAO = 'olhafeira_votos_sugestao';

export function lerVotoSugestao(id) {
  try {
    const voto = JSON.parse(localStorage.getItem(CHAVE_VOTOS_SUGESTAO) || '{}')[String(id)];
    return voto === 'apoio' || voto === 'nego' ? voto : null;
  } catch { return null; }
}

export function salvarVotoSugestao(id, voto) {
  try {
    const mapa = JSON.parse(localStorage.getItem(CHAVE_VOTOS_SUGESTAO) || '{}');
    mapa[String(id)] = voto;
    localStorage.setItem(CHAVE_VOTOS_SUGESTAO, JSON.stringify(mapa));
  } catch { /* O voto remoto continua válido sem armazenamento local. */ }
}

async function escrever(nome, payload, captchaToken) {
  if (!backendAtivo) return { codigo: 'invalido', localOnly: true };
  if (!privacidadeAceita()) return { codigo: CODIGO_PRIVACIDADE_PENDENTE };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { codigo: 'sem_conexao', offline: true, mensagem: SEM_CONEXAO };
  }
  try {
    return await chamarRpc(nome, {
      ...payload,
      client_uuid: gerarUuid(),
      client_ts: new Date().toISOString(),
    }, { autenticado: true, captchaToken });
  } catch {
    return { codigo: 'sem_conexao', offline: true, mensagem: SEM_CONEXAO };
  }
}

function coordenadas(local = {}) {
  return {
    lat: local.lat ?? null,
    lng: local.lng ?? local.lon ?? null,
    acuracia: local.acuracia ?? local.accuracy ?? null,
  };
}

export function sugerirFeira({ nome, endereco, bairro, dia, inicio, fim, local,
  lat, lng, acuracia, accuracy, captchaToken } = {}) {
  return escrever('sugerir_feira', {
    nome, endereco, bairro, dia, inicio, fim,
    ...coordenadas(local ?? { lat, lng, acuracia: acuracia ?? accuracy }),
  }, captchaToken);
}

export function apoiarSugestao({ sugestaoId, sugestao_id: sugestaoIdSql, voto, local,
  lat, lng, acuracia, accuracy, captchaToken } = {}) {
  return escrever('apoiar_sugestao', {
    sugestao_id: sugestaoId ?? sugestaoIdSql,
    voto,
    ...coordenadas(local ?? { lat, lng, acuracia: acuracia ?? accuracy }),
  }, captchaToken);
}

export function denunciarSugestao({ sugestaoId, sugestao_id: sugestaoIdSql, captchaToken } = {}) {
  return escrever('denunciar_sugestao', { sugestao_id: sugestaoId ?? sugestaoIdSql }, captchaToken);
}

export async function minhasSugestoes({ captchaToken } = {}) {
  if (!backendAtivo) return [];
  if (!privacidadeAceita()) return { codigo: CODIGO_PRIVACIDADE_PENDENTE };
  try {
    return await chamarRpc('minhas_sugestoes', {}, { autenticado: true, captchaToken });
  } catch {
    return { codigo: 'sem_conexao', offline: true, mensagem: SEM_CONEXAO };
  }
}
