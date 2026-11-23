import { calculateDistance } from './distance.js';
import { distanciaAoTrechoMetros } from './confirmacoes.js';

export function acharDuplicada(nova, existentes) {
  if (!Number.isFinite(nova?.lat) || !Number.isFinite(nova?.lng)) return null;

  return existentes.find((feira) => {
    if (feira.day !== nova.day || !Number.isFinite(feira.lat) || !Number.isFinite(feira.lng)) return false;
    return calculateDistance(nova.lat, nova.lng, feira.lat, feira.lng) < 0.15
      || distanciaAoTrechoMetros(nova, feira.trecho) < 150;
  }) ?? null;
}
