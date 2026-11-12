import { calculateDistance } from './distance.js';
import { carregarConfirmacoes, salvarConfirmacoes } from './confirmacoes.js';
import { reChavearFotos } from './fotos.js';

const DIAS = ['Domingo', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado'];
export const CHAVE_IDS_SUGESTOES = 'olhafeira_ids_sugestoes';

export function diaAtualSaoPaulo(data = new Date()) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', weekday: 'long',
  }).format(data);
  const dias = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return DIAS[dias.indexOf(weekday)];
}

export function diaNumero(dia) {
  return DIAS.indexOf(dia);
}

export function adaptarSugestao(s, minha = false) {
  return {
    id: String(s.id), nome: s.nome, address: s.endereco, bairro: s.bairro,
    day: DIAS[Number(s.dia)] ?? 'Domingo',
    hours: `${String(s.inicio).slice(0, 5)}–${String(s.fim).slice(0, 5)}`,
    lat: Number(s.lat), lng: Number(s.lng), coord_precisa: true,
    sugestao: minha ? 'minha' : 'publicada', statusSugestao: s.status,
    origem: 'comunidade',
  };
}

export function encontrarDuplicada(feiras, dia, local) {
  if (!local || !Number.isFinite(local.lat) || !Number.isFinite(local.lng)) return null;
  return feiras.find((f) => f.day === dia && Number.isFinite(f.lat) && Number.isFinite(f.lng)
    && calculateDistance(f.lat, f.lng, local.lat, local.lng) < 0.15) ?? null;
}

export function lerMapaIds() {
  try { return JSON.parse(localStorage.getItem(CHAVE_IDS_SUGESTOES) || '{}') || {}; }
  catch { return {}; }
}

export function guardarIdServidor(idLocal, idServidor) {
  const mapa = lerMapaIds();
  mapa[String(idLocal)] = String(idServidor);
  localStorage.setItem(CHAVE_IDS_SUGESTOES, JSON.stringify(mapa));
}

export async function vincularFeiraLocal(idLocal, idServidor) {
  await reChavearFotos(idLocal, idServidor);
  const confirmacoes = carregarConfirmacoes();
  const atualizadas = confirmacoes.map((c) => String(c.id) === String(idLocal)
    ? { ...c, id: String(idServidor) } : c);
  if (!salvarConfirmacoes(atualizadas)) throw new Error('Não foi possível atualizar as confirmações locais.');
  guardarIdServidor(idLocal, idServidor);
  return atualizadas;
}

export function localizacaoAtual() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Ative sua localização para enviar a feira.')); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }),
      () => reject(new Error('Ative sua localização para enviar a feira.')),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });
}
