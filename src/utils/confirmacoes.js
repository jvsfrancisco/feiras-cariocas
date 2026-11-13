// Confirmações "tem feira aqui agora?" ficam só neste aparelho (localStorage).
// Não há backend: nada é enviado e nenhum nome ou e-mail é coletado.
import { calculateDistance } from './distance.js';

export const CHAVE_CONFIRMACOES = 'olhafeira_confirmacoes';
export const RAIO_CONFIRMACAO_METROS = 150;
export const JANELA_CONFIRMACAO_DIAS = 30;

const DIAS_SEMANA = [
  'Domingo',
  'Segunda-Feira',
  'Terça-Feira',
  'Quarta-Feira',
  'Quinta-Feira',
  'Sexta-Feira',
  'Sábado',
];

const MS_DIA = 24 * 60 * 60 * 1000;

// "07:00–13:00" (ou com hífen). Retorna null se não for possível ler o horário.
export function lerHorario(texto) {
  if (typeof texto !== 'string') return null;
  const m = texto.match(/^\s*(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})\s*$/);
  if (!m) return null;
  const inicio = Number(m[1]) * 60 + Number(m[2]);
  const fim = Number(m[3]) * 60 + Number(m[4]);
  if (Number(m[2]) > 59 || Number(m[4]) > 59 || fim <= inicio) return null;
  return { inicio, fim };
}

// A presença no servidor usa o calendário de São Paulo e uma hora de tolerância.
export function dentroDoHorarioDaFeira(feira, data = new Date(), margemMinutos = 60) {
  const horario = lerHorario(feira?.hours);
  if (!horario || !(data instanceof Date) || Number.isNaN(data.getTime())) return false;
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(data).map(({ type, value }) => [type, value]));
  const dias = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (feira.day !== DIAS_SEMANA[dias.indexOf(partes.weekday)]) return false;
  const minutos = Number(partes.hour) * 60 + Number(partes.minute);
  return minutos >= horario.inicio - margemMinutos && minutos <= horario.fim + margemMinutos;
}

export function nomeDoDia(data) {
  return DIAS_SEMANA[data.getDay()];
}

function inicioDoDia(data) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate()).getTime();
}

// Dia local no formato AAAA-MM-DD, para comparar "mesmo dia" sem fuso.
export function dataLocalISO(data) {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

// Diferença em dias corridos entre a data ISO e agora (calendário local).
export function diasDesde(iso, agora) {
  const quando = new Date(iso);
  if (Number.isNaN(quando.getTime())) return null;
  return Math.round((inicioDoDia(agora) - inicioDoDia(quando)) / MS_DIA);
}

export function textoConfirmada(dias) {
  if (dias <= 0) return 'Confirmada hoje';
  if (dias === 1) return 'Confirmada há 1 dia';
  return `Confirmada há ${dias} dias`;
}

export function carregarConfirmacoes() {
  try {
    const bruto = localStorage.getItem(CHAVE_CONFIRMACOES);
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

export function salvarConfirmacoes(lista) {
  try {
    localStorage.setItem(CHAVE_CONFIRMACOES, JSON.stringify(lista));
    return true;
  } catch {
    return false;
  }
}

// Mapa { id: dias } com a confirmação "sim" mais recente de cada feira,
// desde que tenha sido nos últimos 30 dias.
export function ultimasConfirmacoesSim(lista, agora) {
  const mapa = {};
  for (const c of lista) {
    if (!c || c.resposta !== 'sim') continue;
    const dias = diasDesde(c.data, agora);
    if (dias === null || dias < 0 || dias > JANELA_CONFIRMACAO_DIAS) continue;
    if (mapa[c.id] === undefined || dias < mapa[c.id]) mapa[c.id] = dias;
  }
  return mapa;
}

// Distância (m) do usuário ao ponto mais próximo do trecho: projeção plana local
// e distância ao segmento entre vértices consecutivos. Infinity sem trecho válido.
export function distanciaAoTrechoMetros(local, trecho) {
  if (!Array.isArray(trecho) || trecho.length < 2) return Infinity;
  const kx = Math.cos((local.lat * Math.PI) / 180) * 111320;
  const ky = 110540;
  const pontos = trecho
    .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(([lat, lng]) => ({ x: (lng - local.lng) * kx, y: (lat - local.lat) * ky }));

  let menor = Infinity;
  for (let i = 0; i < pontos.length - 1; i++) {
    const a = pontos[i];
    const b = pontos[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    // O usuário está na origem (0, 0): t é a projeção dele sobre o segmento, limitada a [0, 1].
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (-a.x * dx - a.y * dy) / len2));
    menor = Math.min(menor, Math.hypot(a.x + dx * t, a.y + dy * t));
  }
  return menor;
}

// Feira mais próxima que está acontecendo agora e a até 150 m do usuário.
// Usa só coordenadas reais do dado (lat/lng numéricos), nunca as aproximadas
// de appendCoordinates, para não disparar pergunta por engano. Quando a feira
// tem trecho (ex.: Rua Mearim), conta também a distância até o trecho desenhado.
export function feiraParaConfirmar({ feiras, local, agora, confirmacoes = [], ignorar = [] }) {
  if (!local || !Number.isFinite(local.lat) || !Number.isFinite(local.lng)) return null;

  const dia = nomeDoDia(agora);
  const minutos = agora.getHours() * 60 + agora.getMinutes();
  const hoje = dataLocalISO(agora);

  let melhor = null;
  for (const feira of feiras) {
    if (typeof feira.lat !== 'number' || typeof feira.lng !== 'number') continue;
    if (feira.day !== dia) continue;

    const janela = lerHorario(feira.hours);
    if (!janela || minutos < janela.inicio || minutos >= janela.fim) continue;
    if (ignorar.includes(feira.id)) continue;

    const respondidaHoje = confirmacoes.some(
      (c) => c && c.id === feira.id && dataLocalISO(new Date(c.data)) === hoje,
    );
    if (respondidaHoje) continue;

    const metrosAoPonto = calculateDistance(local.lat, local.lng, feira.lat, feira.lng) * 1000;
    const metros = Math.min(metrosAoPonto, distanciaAoTrechoMetros(local, feira.trecho));
    if (metros > RAIO_CONFIRMACAO_METROS) continue;

    if (!melhor || metros < melhor.metros) melhor = { feira, metros };
  }
  return melhor ? melhor.feira : null;
}
