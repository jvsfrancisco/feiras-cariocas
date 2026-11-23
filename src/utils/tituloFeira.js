import { INITIAL_FEIRAS } from '../data/feiras.js';
import { TRECHOS_INFO } from '../data/trechosInfo.js';

const bairrosPorId = new Map();
const contagemCache = new Map();

function chaveBairro(bairro) {
  return String(bairro ?? '').trim().toLocaleLowerCase('pt-BR');
}

function atualizarContagem(chaveAntiga, chaveNova) {
  if (chaveAntiga === chaveNova) return;
  if (chaveAntiga) {
    const restante = (contagemCache.get(chaveAntiga) ?? 0) - 1;
    if (restante <= 0) contagemCache.delete(chaveAntiga);
    else contagemCache.set(chaveAntiga, restante);
  }
  if (chaveNova) {
    contagemCache.set(chaveNova, (contagemCache.get(chaveNova) ?? 0) + 1);
  }
}

export function registrarFeiras(feiras) {
  const lista = Array.isArray(feiras) ? feiras : feiras ? [feiras] : [];
  for (const feira of lista) {
    if (!feira || feira.id == null) continue;
    const id = String(feira.id);
    const chaveNova = chaveBairro(feira.bairro);
    if (!chaveNova) continue;
    const chaveAntiga = bairrosPorId.get(id);
    if (chaveAntiga === chaveNova) continue;
    bairrosPorId.set(id, chaveNova);
    atualizarContagem(chaveAntiga, chaveNova);
  }
}

// Pré-carrega o catálogo base para o título já sair certo antes do mapa montar
// e mesmo quando a lista está filtrada por dia ou busca.
registrarFeiras(INITIAL_FEIRAS);

function contarNoBairro(bairro, todas) {
  const chave = chaveBairro(bairro);
  if (!chave) return 0;
  if (Array.isArray(todas)) {
    let total = 0;
    for (const feira of todas) {
      if (chaveBairro(feira?.bairro) === chave) total += 1;
    }
    return total;
  }
  return contagemCache.get(chave) ?? 0;
}

export function tituloDaFeira(market, todas) {
  if (!market) return '';
  const info = market.id != null ? TRECHOS_INFO[market.id] : null;
  if (info?.titulo) {
    const [antes] = String(info.titulo).split(' · ');
    const limpo = antes.trim();
    if (limpo) return limpo;
  }
  const bairro = String(market.bairro ?? '').trim();
  const endereco = String(market.address ?? '').trim();
  if (!bairro) return endereco ? `Feira ${endereco}` : '';
  if (contarNoBairro(bairro, todas) > 1 && endereco) {
    return `Feira ${bairro} · ${endereco}`;
  }
  return `Feira ${bairro}`;
}
