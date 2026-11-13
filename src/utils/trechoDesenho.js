import { calculateDistance } from './distance.js';

const metros = (a, b) => calculateDistance(a[0], a[1], b[0], b[1]) * 1000;
const lado = (a, b, c) => (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
const entre = (a, b, c) => Math.min(a, b) <= c && c <= Math.max(a, b);

function segmentosSeCruzam(a, b, c, d) {
  const abC = lado(a, b, c);
  const abD = lado(a, b, d);
  const cdA = lado(c, d, a);
  const cdB = lado(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return true;
  return (abC === 0 && entre(a[0], b[0], c[0]) && entre(a[1], b[1], c[1]))
    || (abD === 0 && entre(a[0], b[0], d[0]) && entre(a[1], b[1], d[1]))
    || (cdA === 0 && entre(c[0], d[0], a[0]) && entre(c[1], d[1], a[1]))
    || (cdB === 0 && entre(c[0], d[0], b[0]) && entre(c[1], d[1], b[1]));
}

export function analisarTrechoDesenhado(pontos, feira) {
  let comprimento = 0;
  if (!Array.isArray(pontos)) return { comprimento, erro: 'Marque pelo menos o começo e o fim' };
  for (let i = 1; i < pontos.length; i += 1) comprimento += metros(pontos[i - 1], pontos[i]);
  if (pontos.length < 2) return { comprimento, erro: 'Marque pelo menos o começo e o fim' };
  if (pontos.length > 12) return { comprimento, erro: 'No máximo 12 pontos' };
  for (let i = 0; i < pontos.length; i += 1) {
    const [lat, lng] = pontos[i];
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -23.15 || lat > -22.70 || lng < -43.85 || lng > -43.05) {
      return { comprimento, erro: 'Marque pontos dentro do Rio' };
    }
    if (metros([lat, lng], [feira.lat, feira.lng]) > 600) {
      return { comprimento, erro: 'Esse ponto está longe demais da feira' };
    }
    if (i && lat === pontos[i - 1][0] && lng === pontos[i - 1][1]) {
      return { comprimento, erro: 'Marque um ponto diferente do anterior' };
    }
  }
  if (pontos[0][0] === pontos.at(-1)[0] && pontos[0][1] === pontos.at(-1)[1]) {
    return { comprimento, erro: 'O começo e o fim precisam ser diferentes' };
  }
  for (let i = 0; i < pontos.length - 1; i += 1) {
    for (let j = i + 2; j < pontos.length - 1; j += 1) {
      if (segmentosSeCruzam(pontos[i], pontos[i + 1], pontos[j], pontos[j + 1])) {
        return { comprimento, erro: 'O trecho não pode cruzar a si mesmo' };
      }
    }
  }
  if (comprimento < 30) return { comprimento, erro: 'Trecho curto demais' };
  if (comprimento > 800) return { comprimento, erro: 'Trecho longo demais' };
  return { comprimento, erro: null };
}
