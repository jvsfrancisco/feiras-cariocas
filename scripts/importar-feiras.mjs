import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INITIAL_FEIRAS } from '../src/data/feiras.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RAIZ = path.resolve(__dirname, '..');
const DESTINO_SEED = path.join(RAIZ, 'supabase', 'seed.sql');

const MAPA_DIAS = {
  'Domingo': 0,
  'Segunda-Feira': 1,
  'Terça-Feira': 2,
  'Quarta-Feira': 3,
  'Quinta-Feira': 4,
  'Sexta-Feira': 5,
  'Sábado': 6,
};

export function converterDia(texto) {
  if (typeof texto !== 'string') {
    throw new Error(`Dia inválido: ${String(texto)}`);
  }
  const limpo = texto.trim();
  if (!Object.prototype.hasOwnProperty.call(MAPA_DIAS, limpo)) {
    throw new Error(`Dia desconhecido: "${limpo}"`);
  }
  return MAPA_DIAS[limpo];
}

export function converterHorario(texto) {
  if (typeof texto !== 'string') {
    throw new Error(`Horário inválido: ${String(texto)}`);
  }
  const m = texto.match(/^\s*(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})\s*$/);
  if (!m) {
    throw new Error(`Formato de horário inválido: "${texto}"`);
  }
  const h1 = Number(m[1]);
  const m1 = Number(m[2]);
  const h2 = Number(m[3]);
  const m2 = Number(m[4]);
  if (
    h1 < 0 || h1 > 23 ||
    h2 < 0 || h2 > 23 ||
    m1 < 0 || m1 > 59 ||
    m2 < 0 || m2 > 59 ||
    h2 * 60 + m2 <= h1 * 60 + m1
  ) {
    throw new Error(`Intervalo de horário inválido: "${texto}"`);
  }
  const pad = (n) => String(n).padStart(2, '0');
  return {
    inicio: `${pad(h1)}:${pad(m1)}:00`,
    fim: `${pad(h2)}:${pad(m2)}:00`,
  };
}

function sqlLiteral(valor) {
  if (valor === null || valor === undefined) return 'NULL';
  if (typeof valor === 'boolean') return valor ? 'true' : 'false';
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return 'NULL';
    return String(valor);
  }
  return `'${String(valor).replace(/'/g, "''")}'`;
}

function uuidCuradoParaFeira(idFeira) {
  const sufixo = String(idFeira).replace(/\D/g, '').padStart(12, '0').slice(-12);
  return `00000000-0000-4000-8000-${sufixo || '000000000000'}`;
}

export function gerarSeedSQL(feiras = INITIAL_FEIRAS) {
  const linhas = [
    '-- =============================================================================',
    '-- Seed idempotente gerado automaticamente por scripts/importar-feiras.mjs',
    '-- Fonte: src/data/feiras.js (seção 5 de docs/backend/REQUISITOS.md)',
    '-- =============================================================================',
    '',
    'BEGIN;',
    '',
    'INSERT INTO public.feiras (id, endereco, bairro, ra, dia, inicio, fim, lat, lng, coord_precisa, status, origem)',
    'VALUES',
  ];

  const valoresFeiras = [];
  const trechosCurados = [];

  for (const f of feiras) {
    const id = String(f.id).trim();
    const dia = converterDia(f.day);
    const { inicio, fim } = converterHorario(f.hours);

    // Coordenada precisa apenas quando lat/lng numéricos reais existem no dado original
    // (não aproximados em tempo de execução por appendCoordinates).
    const temCoordReal =
      typeof f.lat === 'number' &&
      Number.isFinite(f.lat) &&
      typeof f.lng === 'number' &&
      Number.isFinite(f.lng) &&
      f.coord_precisa !== false &&
      !f.coordAproximada;

    const lat = temCoordReal ? Number(f.lat.toFixed(7)) : null;
    const lng = temCoordReal ? Number(f.lng.toFixed(7)) : null;
    const coordPrecisa = Boolean(temCoordReal);

    valoresFeiras.push(
      `  (${sqlLiteral(id)}, ${sqlLiteral(f.address)}, ${sqlLiteral(f.bairro)}, ${sqlLiteral(f.ra ?? null)}, ${dia}, ${sqlLiteral(inicio)}, ${sqlLiteral(fim)}, ${sqlLiteral(lat)}, ${sqlLiteral(lng)}, ${sqlLiteral(coordPrecisa)}, 'ativa', 'prefeitura')`,
    );

    if (Array.isArray(f.trecho) && f.trecho.length >= 2) {
      const pontos6Casas = f.trecho.map(([pLat, pLng]) => [
        Number(Number(pLat).toFixed(6)),
        Number(Number(pLng).toFixed(6)),
      ]);
      const wktCoords = pontos6Casas.map(([pLat, pLng]) => `${pLng} ${pLat}`).join(', ');
      trechosCurados.push({
        id: uuidCuradoParaFeira(id),
        feiraId: id,
        pontosJson: JSON.stringify(pontos6Casas),
        wkt: `SRID=4326;LINESTRING(${wktCoords})`,
      });
    }
  }

  linhas.push(`${valoresFeiras.join(',\n')}`);
  linhas.push('ON CONFLICT (id) DO UPDATE SET');
  linhas.push('  endereco = EXCLUDED.endereco,');
  linhas.push('  bairro = EXCLUDED.bairro,');
  linhas.push('  ra = EXCLUDED.ra,');
  linhas.push('  dia = EXCLUDED.dia,');
  linhas.push('  inicio = EXCLUDED.inicio,');
  linhas.push('  fim = EXCLUDED.fim,');
  linhas.push('  lat = EXCLUDED.lat,');
  linhas.push('  lng = EXCLUDED.lng,');
  linhas.push('  coord_precisa = EXCLUDED.coord_precisa,');
  linhas.push('  status = EXCLUDED.status,');
  linhas.push('  origem = EXCLUDED.origem;');
  linhas.push('');

  for (const t of trechosCurados) {
    linhas.push('-- Trecho curado (origem = curado, estado = aprovada)');
    linhas.push(
      'INSERT INTO public.trechos (id, feira_id, pontos, geom, origem, estado, motivo, anterior_id, autor_hash, criado_em, fechado_em)',
    );
    linhas.push(
      `VALUES (${sqlLiteral(t.id)}::uuid, ${sqlLiteral(t.feiraId)}, ${sqlLiteral(t.pontosJson)}::jsonb, extensions.ST_GeogFromText(${sqlLiteral(t.wkt)}), 'curado', 'aprovada', NULL, NULL, NULL, pg_catalog.now(), pg_catalog.now())`,
    );
    linhas.push('ON CONFLICT (id) DO UPDATE SET');
    linhas.push('  feira_id = EXCLUDED.feira_id,');
    linhas.push('  pontos = EXCLUDED.pontos,');
    linhas.push('  geom = EXCLUDED.geom,');
    linhas.push('  origem = EXCLUDED.origem,');
    linhas.push('  estado = EXCLUDED.estado;');
    linhas.push('');
    linhas.push('UPDATE public.feiras');
    linhas.push(`SET trecho_vigente_id = ${sqlLiteral(t.id)}::uuid`);
    linhas.push(`WHERE id = ${sqlLiteral(t.feiraId)} AND trecho_vigente_id IS NULL;`);
    linhas.push('');
  }

  linhas.push('-- Sincroniza tabelas públicas de leitura (pub_feiras, pub_trechos, pub_confirmacoes)');
  linhas.push('SELECT private.sincronizar_tudo_publico();');
  linhas.push('');
  linhas.push('COMMIT;');
  linhas.push('');

  return linhas.join('\n');
}

const sql = gerarSeedSQL(INITIAL_FEIRAS);
fs.mkdirSync(path.dirname(DESTINO_SEED), { recursive: true });
fs.writeFileSync(DESTINO_SEED, sql, 'utf8');
console.log(`Seed gerado em supabase/seed.sql com ${INITIAL_FEIRAS.length} feiras.`);
