import REGIOES from '../data/regioes.json';

// Região da feira: o trecho marcado à mão (tem prioridade) ou a geometria do OpenStreetMap.
// Feira sem região devolve null: só o pino.
export function regiaoDaFeira(market) {
  if (!market) return null;
  if (Array.isArray(market.trecho) && market.trecho.length > 1) {
    return { origem: 'manual', linhas: [market.trecho] };
  }
  const r = REGIOES[market.id];
  if (!r) return null;
  return { origem: 'osm', linhas: r.linhas ?? [], poligono: r.poligono, ponto: r.ponto };
}

// Todos os pontos [lat, lng] da região. O trecho manual enquadra só o trecho;
// as regiões do OpenStreetMap enquadram junto com o pino.
export function pontosDaRegiao(regiao, market) {
  const pts = [...regiao.linhas.flat(), ...(regiao.poligono ?? [])];
  if (regiao.ponto) pts.push(regiao.ponto);
  if (regiao.origem !== 'manual' && market.lat && market.lng) pts.push([market.lat, market.lng]);
  return pts;
}

// Ponto no meio do trecho, medido ao longo da linha (aproximação plana, basta para ~300 m).
export function meioDaLinha(linha) {
  const cosLat = Math.cos((linha[0][0] * Math.PI) / 180);
  const dist = (a, b) => Math.hypot((b[0] - a[0]) * 111320, (b[1] - a[1]) * 111320 * cosLat);
  let total = 0;
  for (let i = 1; i < linha.length; i += 1) total += dist(linha[i - 1], linha[i]);
  let falta = total / 2;
  for (let i = 1; i < linha.length; i += 1) {
    const d = dist(linha[i - 1], linha[i]);
    if (falta <= d && d > 0) {
      const t = falta / d;
      return [
        linha[i - 1][0] + (linha[i][0] - linha[i - 1][0]) * t,
        linha[i - 1][1] + (linha[i][1] - linha[i - 1][1]) * t,
      ];
    }
    falta -= d;
  }
  return linha[0];
}
