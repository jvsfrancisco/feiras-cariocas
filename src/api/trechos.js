// RPCs da Fase 2: propor_trecho e votar_trecho via /rest/v1/rpc/... (seções 4 e 7.2).
// Votos e propostas de trecho NÃO entram na fila offline.
import { backendAtivo, chamarRpc, CODIGO_PRIVACIDADE_PENDENTE, privacidadeAceita } from './client.js';
import { gerarUuid } from './confirmacoesFila.js';

export const CHAVE_VOTOS_TRECHO = 'olhafeira_votos_trecho';
export const CHAVE_PROPOSTAS_TRECHO = 'olhafeira_propostas_trecho';
export const MENSAGEM_SEM_CONEXAO_TRECHO = 'Sem conexão. Tente de novo quando a internet voltar.';

export function salvarPropostaMinha(feiraId, pontos) {
  if (!feiraId || !Array.isArray(pontos) || pontos.length < 2) return false;
  try {
    const mapa = JSON.parse(localStorage.getItem(CHAVE_PROPOSTAS_TRECHO) || '{}');
    mapa[String(feiraId)] = pontos;
    localStorage.setItem(CHAVE_PROPOSTAS_TRECHO, JSON.stringify(mapa));
    return true;
  } catch {
    return false;
  }
}

export function ehPropostaMinha(feiraId, proposta) {
  if (!feiraId || !Array.isArray(proposta?.pontos)) return false;
  try {
    const mapa = JSON.parse(localStorage.getItem(CHAVE_PROPOSTAS_TRECHO) || '{}');
    const meusPontos = mapa?.[String(feiraId)];
    return Array.isArray(meusPontos)
      && meusPontos.length === proposta.pontos.length
      && meusPontos.every((ponto, i) => ponto.length === 2
        && proposta.pontos[i]?.length === 2
        && ponto.every((coord, j) => Math.abs(coord - proposta.pontos[i][j]) < 0.000001));
  } catch {
    return false;
  }
}

export function lerVotosTrecho() {
  try {
    const bruto = localStorage.getItem(CHAVE_VOTOS_TRECHO);
    const mapa = bruto ? JSON.parse(bruto) : {};
    return mapa && typeof mapa === 'object' && !Array.isArray(mapa) ? mapa : {};
  } catch {
    return {};
  }
}

export function lerVotoTrecho(propostaId) {
  if (!propostaId) return null;
  const mapa = lerVotosTrecho();
  const voto = mapa[String(propostaId)];
  return voto === 'aprovo' || voto === 'nego' ? voto : null;
}

export function salvarVotoTrecho(propostaId, voto) {
  if (!propostaId || (voto !== 'aprovo' && voto !== 'nego')) return false;
  try {
    const mapa = lerVotosTrecho();
    mapa[String(propostaId)] = voto;
    localStorage.setItem(CHAVE_VOTOS_TRECHO, JSON.stringify(mapa));
    return true;
  } catch {
    return false;
  }
}

export function limparVotosTrecho() {
  try {
    localStorage.removeItem(CHAVE_VOTOS_TRECHO);
  } catch {
    // Ignora falha de armazenamento
  }
}

function extrairCoordenadas(local, latDireto, lngDireto, acuraciaDireta) {
  const latBruto = latDireto ?? local?.lat;
  const lngBruto = lngDireto ?? local?.lng ?? local?.lon;
  const acuBruta = acuraciaDireta ?? local?.accuracy ?? local?.acuracia;

  const lat = typeof latBruto === 'number' && Number.isFinite(latBruto) ? latBruto : null;
  const lng = typeof lngBruto === 'number' && Number.isFinite(lngBruto) ? lngBruto : null;
  if (lat === null || lng === null) {
    return { lat: null, lng: null, acuracia: null };
  }
  const acuracia = typeof acuBruta === 'number' && Number.isFinite(acuBruta) && acuBruta > 0
    ? acuBruta
    : 30;
  return { lat, lng, acuracia };
}

export async function proporTrecho(arg1, pontosArg, motivoArg, localOuLat, lngArg, acuraciaArg, opcoes = {}) {
  if (!backendAtivo) {
    return { codigo: 'invalido', localOnly: true };
  }

  if (!privacidadeAceita()) {
    return { codigo: CODIGO_PRIVACIDADE_PENDENTE };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { codigo: 'sem_conexao', offline: true, mensagem: MENSAGEM_SEM_CONEXAO_TRECHO };
  }

  const ehObjeto = arg1 && typeof arg1 === 'object' && !Array.isArray(arg1);
  const feiraId = ehObjeto ? (arg1.feiraId ?? arg1.feira_id) : arg1;
  const pontos = ehObjeto ? arg1.pontos : pontosArg;
  const motivo = ehObjeto ? arg1.motivo : motivoArg;
  const captchaToken = ehObjeto ? arg1.captchaToken : opcoes?.captchaToken;

  const coords = ehObjeto
    ? extrairCoordenadas(arg1.local, arg1.lat, arg1.lng, arg1.acuracia ?? arg1.accuracy)
    : typeof localOuLat === 'number'
      ? extrairCoordenadas(null, localOuLat, lngArg, acuraciaArg)
      : extrairCoordenadas(localOuLat);

  try {
    return await chamarRpc(
      'propor_trecho',
      {
        feira_id: String(feiraId ?? ''),
        pontos,
        motivo,
        client_uuid: gerarUuid(),
        client_ts: new Date().toISOString(),
        lat: coords.lat,
        lng: coords.lng,
        acuracia: coords.acuracia,
      },
      { autenticado: true, captchaToken },
    );
  } catch {
    return { codigo: 'sem_conexao', offline: true, mensagem: MENSAGEM_SEM_CONEXAO_TRECHO };
  }
}

export async function votarTrecho(propostaIdArg, votoArg, localArg = null, opcoes = {}) {
  if (!backendAtivo) {
    return { codigo: 'invalido', localOnly: true };
  }

  if (!privacidadeAceita()) {
    return { codigo: CODIGO_PRIVACIDADE_PENDENTE };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { codigo: 'sem_conexao', offline: true, mensagem: MENSAGEM_SEM_CONEXAO_TRECHO };
  }

  const ehObjeto = propostaIdArg && typeof propostaIdArg === 'object' && !Array.isArray(propostaIdArg);
  const propostaId = ehObjeto ? (propostaIdArg.propostaId ?? propostaIdArg.proposta_id) : propostaIdArg;
  const voto = ehObjeto ? propostaIdArg.voto : votoArg;
  const local = ehObjeto ? propostaIdArg.local : localArg;
  const captchaToken = ehObjeto ? propostaIdArg.captchaToken : opcoes?.captchaToken;

  const coords = ehObjeto
    ? extrairCoordenadas(local, propostaIdArg.lat, propostaIdArg.lng, propostaIdArg.acuracia ?? propostaIdArg.accuracy)
    : extrairCoordenadas(local);

  try {
    const res = await chamarRpc(
      'votar_trecho',
      {
        proposta_id: String(propostaId ?? ''),
        voto,
        lat: coords.lat,
        lng: coords.lng,
        acuracia: coords.acuracia,
        client_uuid: gerarUuid(),
        client_ts: new Date().toISOString(),
      },
      { autenticado: true, captchaToken },
    );

    if (res?.codigo === 'ok' && propostaId) {
      salvarVotoTrecho(propostaId, voto);
    }

    return res;
  } catch {
    return { codigo: 'sem_conexao', offline: true, mensagem: MENSAGEM_SEM_CONEXAO_TRECHO };
  }
}
