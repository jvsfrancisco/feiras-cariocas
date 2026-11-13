// Fila offline de confirmações com client_uuid e janela de 15 min de client_ts (seções 4, 7.1 e critério 10).
import { backendAtivo, chamarRpc, CODIGO_CAPTCHA, CODIGO_PRIVACIDADE_PENDENTE, privacidadeAceita } from './client.js';

export const CHAVE_FILA_CONFIRMACOES = 'olhafeira_fila_confirmacoes';
export const JANELA_CLIENT_TS_MS = 15 * 60 * 1000;

export function gerarUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function lerFilaConfirmacoes() {
  try {
    const bruto = localStorage.getItem(CHAVE_FILA_CONFIRMACOES);
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

export function salvarFilaConfirmacoes(lista) {
  try {
    localStorage.setItem(CHAVE_FILA_CONFIRMACOES, JSON.stringify(lista));
    return true;
  } catch {
    return false;
  }
}

export function dentroDaJanela15Min(clientTs, agoraMs = Date.now()) {
  const tsMs = Date.parse(clientTs);
  if (!Number.isFinite(tsMs)) return false;
  return Math.abs(agoraMs - tsMs) <= JANELA_CLIENT_TS_MS;
}

export function enfileirarConfirmacao(item) {
  const fila = lerFilaConfirmacoes().filter((existente) => (
    existente &&
    existente.client_uuid !== item.client_uuid &&
    dentroDaJanela15Min(existente.client_ts)
  ));
  fila.push(item);
  salvarFilaConfirmacoes(fila);
  return item;
}

let sincronizando = false;

export async function sincronizarFilaConfirmacoes({ captchaToken } = {}) {
  if (!backendAtivo || sincronizando || !privacidadeAceita()) {
    return { enviados: 0, pendentes: lerFilaConfirmacoes().length };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { enviados: 0, pendentes: lerFilaConfirmacoes().length, offline: true };
  }

  sincronizando = true;
  try {
    const filaOriginal = lerFilaConfirmacoes();
    if (filaOriginal.length === 0) return { enviados: 0, pendentes: 0 };

    const agoraMs = Date.now();
    const restantes = [];
    let enviados = 0;
    let ultimoResultado = null;
    let captcha = false;

    for (const [indice, item] of filaOriginal.entries()) {
      if (!item || !item.client_uuid || !dentroDaJanela15Min(item.client_ts, agoraMs)) {
        // Fora da janela de 15 min: descartada (seção 4 e critério 10)
        continue;
      }

      try {
        const res = await chamarRpc(
          'confirmar',
          {
            feira_id: String(item.feira_id),
            resposta: item.resposta,
            lat: Number(item.lat),
            lng: Number(item.lng),
            acuracia: Number(item.acuracia),
            client_uuid: item.client_uuid,
            client_ts: item.client_ts,
          },
          { autenticado: true, captchaToken },
        );
        if (res?.codigo === CODIGO_CAPTCHA) {
          // Captcha recusado: para aqui e guarda esta e as próximas para tentar depois
          restantes.push(...filaOriginal.slice(indice));
          captcha = true;
          break;
        }
        ultimoResultado = res;
        enviados += 1;
      } catch {
        // Falha de rede: mantém na fila com o mesmo client_uuid para tentar de novo
        restantes.push(item);
      }
    }

    salvarFilaConfirmacoes(restantes);
    return { enviados, pendentes: restantes.length, ultimoResultado, captcha };
  } finally {
    sincronizando = false;
  }
}

export async function enviarConfirmacao({
  feiraId,
  resposta,
  lat,
  lng,
  acuracia,
  captchaToken,
}) {
  if (!backendAtivo) {
    return { codigo: 'ok', localOnly: true };
  }

  if (!privacidadeAceita()) {
    return { codigo: CODIGO_PRIVACIDADE_PENDENTE };
  }

  const item = {
    feira_id: String(feiraId),
    resposta,
    lat: Number(lat),
    lng: Number(lng),
    acuracia: Number.isFinite(acuracia) && acuracia > 0 ? Number(acuracia) : 30,
    client_uuid: gerarUuid(),
    client_ts: new Date().toISOString(),
  };

  enfileirarConfirmacao(item);

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { codigo: 'ok', enfileirada: true };
  }

  const { pendentes, ultimoResultado, captcha } = await sincronizarFilaConfirmacoes({ captchaToken });
  if (captcha) {
    // Não enfileira por falha de captcha: tira a recém-criada da fila
    salvarFilaConfirmacoes(lerFilaConfirmacoes().filter((f) => f?.client_uuid !== item.client_uuid));
    return { codigo: CODIGO_CAPTCHA };
  }
  const aindaNaFila = lerFilaConfirmacoes().some((f) => f?.client_uuid === item.client_uuid);
  if (aindaNaFila || (pendentes > 0 && !ultimoResultado)) {
    return { codigo: 'ok', enfileirada: true };
  }

  return ultimoResultado ?? { codigo: 'ok' };
}
