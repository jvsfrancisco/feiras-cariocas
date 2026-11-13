import L from 'leaflet';

// Ícones do mapa pequeno do cadastro de feira (Leaflet). Os pinos do mapa principal
// (MapLibre) estão em mapPinos.js.
export const COR_PINO = {
  verde: '#5B7A3A',
  manga: '#F28C28',
  tomate: '#C73A22',
};

const TOMATE_MARK_SVG =
  '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path fill="#D9432B" d="M4 13C3 7 8 5 14 5c6-2 13 1 14 8 2 8-3 15-12 16C8 30 3 23 4 17c0-2 0-3 0-4Z"/><path fill="#5B7A3A" d="M15 6C13 3 10 2 8 2c1 3 3 5 6 6-2 1-3 2-4 4 4 0 6-2 7-4 1 3 3 4 6 5 0-3-1-5-3-6 3 0 5-1 7-2-3-2-6-2-9 0 1-2 1-4 0-5-2 1-3 3-3 6Z"/><ellipse cx="12" cy="17" rx="4" ry="5" fill="#FFFDF8"/><ellipse cx="22" cy="17" rx="4" ry="5" fill="#FFFDF8"/><ellipse cx="13" cy="18" rx="2.6" ry="3.4" fill="#48271F"/><ellipse cx="23" cy="18" rx="2.6" ry="3.4" fill="#48271F"/><circle cx="12" cy="16.5" r="1" fill="#FFFDF8"/><circle cx="22" cy="16.5" r="1" fill="#FFFDF8"/></svg>';

// Pino arrastável do cadastro de feira: gota 36x42 px girada em área de 48x48 px.
export function pinoEdicaoIcone() {
  return L.divIcon({
    className: 'map-pin marcador-feira',
    html: `<span class="pin-shape" style="--pin:${COR_PINO.tomate}"><span class="pin-number">${TOMATE_MARK_SVG}</span></span>`,
    iconSize: [48, 48],
    iconAnchor: [24, 44],
  });
}
