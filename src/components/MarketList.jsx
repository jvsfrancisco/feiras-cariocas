import { useState } from 'react';
import MarketCard from './MarketCard';
import Fruta from './Frutas';
import { Check, ChevronDown } from 'lucide-react';
import { acontecendoAgora } from '../utils/diaCor';

const ITENS_POR_PAGINA = 12;

export default function MarketList({
  markets,
  userLat,
  userLon,
  isLoading,
  diasConfirmadas = {},
  agora = new Date(),
  selectedDay = 'Todos',
  mensagemVazia = 'Você pode tentar outro nome ou voltar a ver todas as feiras.',
  mostrarDia = false,
  onAbrir,
  onLimpar,
}) {
  // A paginação volta ao início sempre que a lista de feiras muda (filtro ou busca).
  // Guardar a lista junto do contador evita useEffect só para resetar o estado.
  const [paginacao, setPaginacao] = useState({ lista: markets, quantidade: ITENS_POR_PAGINA });
  const quantidade = paginacao.lista === markets ? paginacao.quantidade : ITENS_POR_PAGINA;

  if (isLoading) {
    return (
      <div className="state-body loading flex flex-col items-center justify-center py-6 px-4 text-center flex-1" role="status" aria-live="polite">
        <Fruta nome="tomato" className="tomate-pula w-40 h-40 mb-4" />
        <h2 className="font-display text-[30px] leading-[1.04] font-extrabold tracking-[-0.05em] text-tinta mb-2">Buscando feiras...</h2>
        <p className="text-[13px] leading-6 text-tinta-2 max-w-[265px]">Organizando os dias e bairros para você.</p>
      </div>
    );
  }

  if (markets.length === 0) {
    return (
      <div className="state-body empty flex flex-col items-center justify-center py-6 px-4 text-center flex-1 animate-fade-in" role="status" aria-live="polite">
        <Fruta nome="tomato" className="w-40 h-40 mb-4" />
        <h2 className="font-display text-[30px] leading-[1.04] font-extrabold tracking-[-0.05em] text-tinta mb-2">
          Nenhuma feira nesse bairro
        </h2>
        <p className="text-[13px] leading-6 text-tinta-2 max-w-[265px] text-balance">
          {mensagemVazia}
        </p>
        {onLimpar && (
          <button
            type="button"
            onClick={onLimpar}
            className="pill-btn mt-6 h-12 min-h-12 px-6 rounded-full bg-verde text-papel font-extrabold text-sm active:scale-95 focus-visible:ring-2 focus-visible:ring-manga focus-visible:ring-offset-2 outline-none"
          >
            Limpar busca e ver todos os dias
          </button>
        )}
      </div>
    );
  }

  const visibleMarkets = markets.slice(0, quantidade);
  const hasMore = quantidade < markets.length;
  const titulo = selectedDay === 'Todos' ? 'Feiras por perto' : `Feiras de ${selectedDay.toLocaleLowerCase('pt-BR')}`;

  return (
    <section className="list-content w-full max-w-7xl mx-auto pt-6 pb-6 flex-1">
      <div className="list-title-row flex items-center justify-between px-4 mb-4 gap-2">
        <h2 className="font-display text-2xl leading-[1.05] font-extrabold tracking-[-0.05em] text-tinta">{titulo}</h2>
        <span className="result-count text-xs text-tinta-2 whitespace-nowrap">{markets.length} {markets.length === 1 ? 'feira' : 'feiras'}</span>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 px-4">
        {visibleMarkets.map((market, idx) => (
          <li key={market.id}>
            <MarketCard
              market={market}
              userLat={userLat}
              userLon={userLon}
              index={idx}
              diasConfirmada={diasConfirmadas[market.id] ?? null}
              agora={acontecendoAgora(market, agora)}
              mostrarDia={mostrarDia}
              onAbrir={onAbrir}
            />
          </li>
        ))}
      </ul>

      {hasMore && (
        <div className="mt-8 flex justify-center px-4">
          <button
            onClick={() => setPaginacao({ lista: markets, quantidade: quantidade + ITENS_POR_PAGINA })}
            aria-label={`Ver mais ${ITENS_POR_PAGINA} feiras`}
            className="group flex items-center gap-2 h-12 bg-papel hover:bg-verde text-verde hover:text-creme px-6 rounded-full font-bold text-base transition-colors border-2 border-verde focus-visible:ring-2 focus-visible:ring-manga focus:outline-none active:scale-95"
          >
            <span>Ver mais feiras</span>
            <ChevronDown className="group-hover:translate-y-1 transition-transform" aria-hidden="true" />
          </button>
        </div>
      )}

      {!hasMore && markets.length > ITENS_POR_PAGINA && (
        <p className="flex items-center justify-center gap-2 text-center text-tinta-2 font-bold text-sm mt-8" role="status">
          <Check size={16} strokeWidth={3} aria-hidden="true" /> Você chegou ao fim da lista
        </p>
      )}
    </section>
  );
}
