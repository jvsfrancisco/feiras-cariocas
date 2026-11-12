// Gera src/data/regioes.json: a geometria da rua (ou do mercado) de cada feira,
// tirada do OpenStreetMap pela Overpass API (gratuita, com limite de uso).
//
// Uso:  node scripts/gerar-regioes.mjs            (todas as feiras sem trecho, em lotes)
//       node scripts/gerar-regioes.mjs 1 7 49     (só estes ids, útil para testar)
//
// Dados: colaboradores do OpenStreetMap (ODbL). Limite: a geometria é a rua inteira,
// não o trecho exato onde a feira monta.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = resolve(RAIZ, 'src/data/regioes.json');
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const ESPELHO = 'https://overpass.kumi.systems/api/interpreter';
const USER_AGENT = 'olha-a-feira/0.1 (olhafeira.tech)';
const PAUSA_MS = 6000;
const TAMANHO_LOTE = 15;
const LIMITE_TOTAL_MS = 8 * 60 * 1000;
const RAIO_RUA_M = 300;
const RAIO_MERCADO_M = 200;
const TOLERANCIA_M = 3;
const MAX_PONTOS = 60;
const TENTATIVAS = 2;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Nomes -----------------------------------------------------------------

const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Prefixos de tipo de via, já sem acento e sem ponto.
const TIPOS = new Set([
  'rua', 'r', 'av', 'avenida', 'praca', 'pca', 'pc', 'travessa', 'tv', 'estrada', 'est', 'largo', 'lgo',
  'alameda', 'al', 'beco', 'ladeira', 'rodovia', 'avn', 'prc', 'etr', 'pra', 'vdt', 'viaduto',
]);
// Títulos abreviados que o OSM costuma escrever por extenso (ou omitir).
const TITULOS = new Set([
  'almte', 'gal', 'general', 'cel', 'coronel', 'prof', 'professor', 'profa', 'professora', 'dr', 'dra', 'doutor',
  'pres', 'presidente', 'min', 'ministro', 'alm', 'almirante', 'cap', 'capitao', 'eng', 'engenheiro',
  'mal', 'marechal', 'dep', 'deputado', 'cons', 'conselheiro', 'ten', 'tenente', 'sen', 'senador',
  'vis', 'visconde', 'bar', 'barao', 'cde', 'conde', 'gov', 'governador', 'pe', 'padre', 'cmte',
  'comandante', 'major', 'maj', 'sargento', 'sgt', 'des', 'desembargador', 'vereador', 'ver',
  'santo', 'sto', 'santa', 'sta', 'sao', 'frei', 'dom', 'duque', 'princesa', 'princ', 'baroneza', 'cond',
  'condessa', 'comendador', 'com', 'bispo', 'monsenhor', 'mons', 'tte', 'brigadeiro', 'brig',
]);
const LIGACOES = new Set(['de', 'do', 'da', 'dos', 'das', 'e']);

// Palavras que identificam a rua (sem tipo, título nem ligação).
export function tokensDoNome(nome) {
  return semAcento(nome)
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !TIPOS.has(t) && !TITULOS.has(t) && !LIGACOES.has(t));
}

// Primeiro trecho do address antes de '/' ou ','.
export function nomeDaRua(address) {
  return address.split(/[/,]/)[0].trim();
}

const CLASSES = { a: 'aáàâãä', e: 'eéèêë', i: 'iíìîï', o: 'oóòôõö', u: 'uúùûü', c: 'cç' };
// Tokens sem acento viram classes ([aáàâãä]) para casar com o nome acentuado do OSM.
// Só sobram letras, números e hífen: não há o que escapar.
const escapaRegex = (s) => s
  .replace(/[^a-z0-9.*-]/g, '')
  .replace(/[a-z]/g, (c) => (CLASSES[c] ? `[${CLASSES[c]}]` : c));

// --- Geometria ---------------------------------------------------------------

const toRad = (g) => (g * Math.PI) / 180;

function metros(a, b) {
  const R = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Distância de p ao segmento a-b, em metros (projeção plana local).
function distSegmento(p, a, b) {
  const k = Math.cos(toRad(a[0]));
  const px = (p[1] - a[1]) * k * 111320;
  const py = (p[0] - a[0]) * 110540;
  const bx = (b[1] - a[1]) * k * 111320;
  const by = (b[0] - a[0]) * 110540;
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return Math.hypot(px - t * bx, py - t * by);
}

export function douglasPeucker(pts, tol) {
  if (pts.length < 3) return pts;
  let maior = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const d = distSegmento(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maior) { maior = d; idx = i; }
  }
  if (maior <= tol) return [pts[0], pts[pts.length - 1]];
  const esq = douglasPeucker(pts.slice(0, idx + 1), tol);
  const dir = douglasPeucker(pts.slice(idx), tol);
  return [...esq.slice(0, -1), ...dir];
}

// Simplifica a ~3 m; se ainda passar de 60 pontos, aumenta a tolerância até caber.
export function simplifica(pts) {
  let tol = TOLERANCIA_M;
  let r = douglasPeucker(pts, tol);
  while (r.length > MAX_PONTOS) {
    tol *= 1.5;
    r = douglasPeucker(pts, tol);
  }
  return r.map(([la, ln]) => [Number(la.toFixed(6)), Number(ln.toFixed(6))]);
}

const igual = (a, b) => a[0] === b[0] && a[1] === b[1];

// Junta ways que se encostam pelas pontas (mesmo nó) numa linha só.
export function juntaLinhas(linhas) {
  const L = linhas.map((l) => [...l]);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (let i = 0; i < L.length && !mudou; i += 1) {
      for (let j = i + 1; j < L.length && !mudou; j += 1) {
        const a = L[i];
        const b = L[j];
        let novo = null;
        if (igual(a[a.length - 1], b[0])) novo = [...a, ...b.slice(1)];
        else if (igual(a[a.length - 1], b[b.length - 1])) novo = [...a, ...[...b].reverse().slice(1)];
        else if (igual(a[0], b[b.length - 1])) novo = [...b, ...a.slice(1)];
        else if (igual(a[0], b[0])) novo = [...[...b].reverse(), ...a.slice(1)];
        if (novo) {
          L[i] = novo;
          L.splice(j, 1);
          mudou = true;
        }
      }
    }
  }
  return L;
}

// --- Overpass ----------------------------------------------------------------

const INICIO = Date.now();
const restante = () => LIMITE_TOTAL_MS - (Date.now() - INICIO);

async function pedido(url, consulta) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(consulta)}`,
    signal: AbortSignal.timeout(Math.max(5000, Math.min(75000, restante()))),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Até 2 tentativas (com recuo) no servidor principal; se falhar, espelho de reserva.
async function overpass(consulta) {
  const alvos = [[OVERPASS, 'principal'], [ESPELHO, 'espelho']];
  let ultimo;
  for (const [url, rotulo] of alvos) {
    let espera = 8000;
    for (let t = 1; t <= TENTATIVAS; t += 1) {
      if (restante() < 10000) throw new Error('limite de tempo');
      try {
        return await pedido(url, consulta);
      } catch (e) {
        ultimo = e;
        console.warn(`  ${rotulo}, tentativa ${t}/${TENTATIVAS}: ${e.message}`);
        if (rotulo === 'espelho' && t >= 1) break;
        if (t < TENTATIVAS) { await dormir(espera); espera *= 2; }
      }
    }
  }
  throw ultimo ?? new Error('Overpass indisponível');
}

// Uma consulta por lote: união das ruas pelo nome e dos mercados, em volta de cada feira.
function montaConsultaLote(itens) {
  const blocos = itens.map(({ feira, tokens }) => {
    const regex = escapaRegex(tokens.join('.*'));
    const c = `${feira.lat},${feira.lng}`;
    return `  way["highway"]["name"~"${regex}",i](around:${RAIO_RUA_M},${c});
  node["amenity"="marketplace"](around:${RAIO_MERCADO_M},${c});
  way["amenity"="marketplace"](around:${RAIO_MERCADO_M},${c});
  relation["amenity"="marketplace"](around:${RAIO_MERCADO_M},${c});`;
  });
  return `[out:json][timeout:60];\n(\n${blocos.join('\n')}\n);\nout geom;`;
}

const geom = (g) => g.map((p) => [p.lat, p.lon]);

// Menor distância (m) do ponto a uma polilinha.
function distLinha(p, linha) {
  let m = Infinity;
  for (let i = 0; i < linha.length - 1; i += 1) m = Math.min(m, distSegmento(p, linha[i], linha[i + 1]));
  return m;
}

function pontoDoMercado(m) {
  if (m.type === 'node') return [m.lat, m.lon];
  if (m.bounds) return [(m.bounds.minlat + m.bounds.maxlat) / 2, (m.bounds.minlon + m.bounds.maxlon) / 2];
  return null;
}

// Associa os elementos do lote a UMA feira: rua pelo nome exato (sem tipo/título) e
// proximidade; mercado pela proximidade.
export function interpreta(feira, tokens, dados) {
  const alvo = tokens.join(' ');
  const centro = [feira.lat, feira.lng];
  const linhasBrutas = dados.elements
    .filter((e) => e.type === 'way' && e.tags?.highway && e.tags?.name && e.geometry
      && tokensDoNome(e.tags.name).join(' ') === alvo)
    .map((w) => geom(w.geometry))
    .filter((l) => l.length > 1 && distLinha(centro, l) <= RAIO_RUA_M);

  const mercados = dados.elements
    .filter((e) => e.tags?.amenity === 'marketplace')
    .map((m) => ({ m, p: pontoDoMercado(m) }))
    .filter(({ p }) => p && metros(centro, p) <= RAIO_MERCADO_M)
    .sort((a, b) => metros(centro, a.p) - metros(centro, b.p));

  let poligono = null;
  let ponto = null;
  const comPoligono = mercados.find(({ m }) => m.type === 'way' && m.geometry && m.geometry.length >= 4
    && igual(geom(m.geometry)[0], geom(m.geometry)[m.geometry.length - 1]));
  if (comPoligono) poligono = simplifica(geom(comPoligono.m.geometry));
  else if (mercados[0]) ponto = mercados[0].p;

  if (!linhasBrutas.length && !poligono && !ponto) return null;

  const resultado = {
    tipo: poligono || ponto ? 'mercado' : 'rua',
    linhas: juntaLinhas(linhasBrutas).map(simplifica),
  };
  if (poligono) resultado.poligono = poligono;
  if (ponto) resultado.ponto = ponto.map((n) => Number(n.toFixed(6)));
  return resultado;
}

// --- Principal ---------------------------------------------------------------

async function principal() {
  const { INITIAL_FEIRAS } = await import(pathToFileURL(resolve(RAIZ, 'src/data/feiras.js')).href);
  const so = new Set(process.argv.slice(2));
  const feiras = INITIAL_FEIRAS.filter((f) => !f.trecho && (so.size === 0 || so.has(f.id)));

  // Parte do arquivo atual: o que não for reconsultado fica como está.
  let regioes = {};
  try { regioes = JSON.parse(await readFile(SAIDA, 'utf8')); } catch { /* ainda não existe */ }
  const grava = () => writeFile(SAIDA, `${JSON.stringify(regioes)}\n`);

  const sem = [];
  const validas = [];
  for (const feira of feiras) {
    const tokens = tokensDoNome(nomeDaRua(feira.address));
    if (!feira.lat || !feira.lng || tokens.length === 0) {
      sem.push({ id: feira.id, address: feira.address, bairro: feira.bairro, motivo: 'sem coordenada ou nome utilizável' });
    } else validas.push({ feira, tokens });
  }

  const lotes = [];
  for (let i = 0; i < validas.length; i += TAMANHO_LOTE) lotes.push(validas.slice(i, i + TAMANHO_LOTE));
  console.log(`${feiras.length} feiras, ${validas.length} consultáveis, ${lotes.length} lote(s) de ~${TAMANHO_LOTE}`);

  let feitos = 0;
  for (let n = 0; n < lotes.length; n += 1) {
    const lote = lotes[n];
    if (restante() < 20000) {
      console.warn('Limite total de 8 min atingido: gravando o que há.');
      for (const l of lotes.slice(n).flat()) sem.push({ id: l.feira.id, address: l.feira.address, bairro: l.feira.bairro, motivo: 'não consultada (limite de tempo)' });
      break;
    }
    const t0 = Date.now();
    try {
      const dados = await overpass(montaConsultaLote(lote));
      let achou = 0;
      for (const { feira, tokens } of lote) {
        const r = interpreta(feira, tokens, dados);
        if (r) { regioes[feira.id] = r; achou += 1; } else {
          delete regioes[feira.id];
          sem.push({ id: feira.id, address: feira.address, bairro: feira.bairro, motivo: 'nada casou no OSM' });
        }
      }
      feitos += lote.length;
      console.log(`Lote ${n + 1}/${lotes.length}: ${achou}/${lote.length} com região (${dados.elements.length} elementos, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    } catch (e) {
      console.log(`Lote ${n + 1}/${lotes.length}: erro (${e.message})`);
      for (const l of lote) sem.push({ id: l.feira.id, address: l.feira.address, bairro: l.feira.bairro, motivo: `erro: ${e.message}` });
    }
    await grava(); // incremental, a cada lote
    if (n < lotes.length - 1) await dormir(PAUSA_MS);
  }

  await grava();
  console.log(`\nFeiras consultadas com sucesso: ${feitos} de ${validas.length}`);
  console.log(`Com região (no arquivo): ${Object.keys(regioes).length}`);
  console.log(`Sem região nesta execução: ${sem.length}`);
  sem.forEach((s) => console.log(`  ${s.id} | ${s.address} | ${s.bairro} | ${s.motivo}`));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((e) => { console.error(e); process.exit(1); });
}
