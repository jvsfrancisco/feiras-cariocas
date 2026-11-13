// Leitura das tabelas públicas pub_feiras, pub_trechos e pub_confirmacoes (seção 7.5).
import { backendAtivo, lerTabelaPublica } from './client.js';

const DIAS_POR_NUMERO = [
  'Domingo',
  'Segunda-Feira',
  'Terça-Feira',
  'Quarta-Feira',
  'Quinta-Feira',
  'Sexta-Feira',
  'Sábado',
];

const MS_PROPOSTA_ABERTA = 14 * 24 * 60 * 60 * 1000;

function formatarHoraCurta(horaSql) {
  if (typeof horaSql !== 'string') return '07:00';
  const partes = horaSql.split(':');
  if (partes.length < 2) return horaSql;
  return `${partes[0].padStart(2, '0')}:${partes[1].padStart(2, '0')}`;
}

export function adaptarFeiraPublica(f, trechosPorFeira = {}) {
  const id = String(f.id);
  const infoTrecho = trechosPorFeira[id] ?? {};
  const diaNome = DIAS_POR_NUMERO[Number(f.dia)] ?? 'Domingo';
  const hours = `${formatarHoraCurta(f.inicio)}–${formatarHoraCurta(f.fim)}`;

  const feira = {
    id,
    address: f.endereco,
    bairro: f.bairro,
    day: diaNome,
    hours,
    ra: f.ra ?? '',
    coord_precisa: Boolean(f.coord_precisa),
      status: f.status,
    origem: f.origem ?? 'prefeitura',
  };

  if (f.coord_precisa && typeof f.lat === 'number' && typeof f.lng === 'number') {
    feira.lat = f.lat;
    feira.lng = f.lng;
  }

  if (Array.isArray(infoTrecho.vigente) && infoTrecho.vigente.length >= 2) {
    feira.trecho = infoTrecho.vigente;
    feira.trechoOrigem = infoTrecho.vigenteOrigem ?? 'curado';
  }

  if (infoTrecho.propostaAberta) {
    feira.trechoEmVotacao = infoTrecho.propostaAberta;
  }

  return feira;
}

export async function carregarDadosPublicos() {
  if (!backendAtivo) return null;

  const [pubFeiras, pubTrechos, pubConfirmacoes] = await Promise.all([
    lerTabelaPublica(
      'pub_feiras',
      'select=id,endereco,bairro,ra,dia,inicio,fim,lat,lng,coord_precisa,status,trecho_vigente_id,origem&order=id.asc',
    ),
    lerTabelaPublica(
      'pub_trechos',
      'select=id,feira_id,pontos,origem,estado,criado_em,expira_em',
    ),
    lerTabelaPublica(
      'pub_confirmacoes',
      'select=feira_id,ultima_confirmacao_sim,confirmacoes_sim_28d,sem_feira_hoje',
    ),
  ]);

  if (!Array.isArray(pubFeiras) || pubFeiras.length === 0) {
    return null;
  }

  const agoraMs = Date.now();
  const trechosPorFeira = {};

  if (Array.isArray(pubTrechos)) {
    for (const t of pubTrechos) {
      if (!t || !t.feira_id || !Array.isArray(t.pontos)) continue;
      const fid = String(t.feira_id);
      if (!trechosPorFeira[fid]) trechosPorFeira[fid] = {};

      if (t.estado === 'aprovada') {
        trechosPorFeira[fid].vigente = t.pontos;
        trechosPorFeira[fid].vigenteOrigem = t.origem;
      } else if (t.estado === 'aberta') {
        // Expiração vale na leitura (seção 7.2: 14 dias a partir de criado_em)
        const criadoMs = Date.parse(t.criado_em);
        if (Number.isFinite(criadoMs) && agoraMs < criadoMs + MS_PROPOSTA_ABERTA) {
          trechosPorFeira[fid].propostaAberta = {
            id: t.id,
            pontos: t.pontos,
            criadoEm: t.criado_em,
            expiraEm: t.expira_em,
          };
        }
      }
    }
  }

  const feiras = pubFeiras.map((f) => adaptarFeiraPublica(f, trechosPorFeira));
  const confirmacoesPorFeira = {};

  if (Array.isArray(pubConfirmacoes)) {
    for (const c of pubConfirmacoes) {
      if (!c || !c.feira_id) continue;
      confirmacoesPorFeira[String(c.feira_id)] = {
        ultimaConfirmacaoSim: c.ultima_confirmacao_sim ?? null,
        confirmacoesSim28d: Number(c.confirmacoes_sim_28d) || 0,
        semFeiraHoje: Boolean(c.sem_feira_hoje),
      };
    }
  }

  return { feiras, confirmacoesPorFeira };
}

// Sugestões publicadas são carregadas separadamente das feiras ativas.
export async function carregarSugestoesPublicas() {
  if (!backendAtivo) return [];
  return lerTabelaPublica(
    'pub_sugestoes',
    'select=id,nome,endereco,bairro,dia,inicio,fim,lat,lng,criado_em&order=criado_em.desc',
  );
}
