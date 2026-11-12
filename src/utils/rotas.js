// Até 2 km vale ir a pé; acima disso, de carro. Sem distância, a pé.
const LIMITE_A_PE_KM = 2;

export function modoSugerido(distanciaKm) {
  return distanciaKm !== undefined && distanciaKm > LIMITE_A_PE_KM ? 'driving' : 'walking';
}

export function formatarKm(km) {
  return `${km.toFixed(1).replace('.', ',')} km`;
}

export function diaCurto(dia) {
  return typeof dia === 'string' ? dia.replace('-Feira', '') : '';
}

// Abre direções do Google Maps quando há posição; sem posição, busca o endereço.
export function urlGoogleMaps({ feira, userLat, userLon, modo = 'walking' }) {
  const destino = feira.lat && feira.lng
    ? `${feira.lat},${feira.lng}`
    : encodeURIComponent(`${feira.address}, ${feira.bairro}, Rio de Janeiro`);
  if (userLat && userLon) {
    return `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLon}&destination=${destino}&travelmode=${modo}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${destino}`;
}
