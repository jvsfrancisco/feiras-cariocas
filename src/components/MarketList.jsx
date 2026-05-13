import { useState, useEffect } from 'react';
import MarketCard from './MarketCard';
import { ChevronDown, Search } from 'lucide-react';

export default function MarketList({ markets, userLat, userLon, isLoading }) {
  const ITEMS_PER_PAGE = 12;
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  // Reset count when markets change (e.g. filter or search)
  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [markets]);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full" aria-hidden="true">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 animate-pulse h-[320px]">
              <div className="flex justify-between mb-4">
                <div className="w-12 h-12 bg-gray-200 rounded-2xl"></div>
                <div className="w-24 h-6 bg-gray-100 rounded-lg"></div>
              </div>
              <div className="h-6 bg-gray-200 rounded-md w-3/4 mb-3"></div>
              <div className="h-4 bg-gray-100 rounded-md w-full mb-2"></div>
              <div className="h-4 bg-gray-100 rounded-md w-1/2 mb-6"></div>
              <div className="h-12 bg-gray-200 rounded-xl w-full mt-auto"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (markets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-[6rem] px-6 text-center animate-fade-in" role="status" aria-live="polite">
        <div className="w-24 h-24 bg-orange-50 rounded-full flex items-center justify-center text-5xl mb-6 shadow-inner ring-8 ring-orange-50/50" aria-hidden="true">
          🔍
        </div>
        <h3 className="text-2xl font-black text-gray-900 mb-3">
          Ops! Nenhuma feira por aqui
        </h3>
        <p className="text-gray-700 max-w-xs mx-auto leading-relaxed font-medium">
          Não encontramos feiras com esses filtros. Que tal tentar outro bairro ou dia da semana?
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <div className="text-xs font-bold text-orange-700 uppercase tracking-widest bg-orange-50 px-4 py-2 rounded-full border border-orange-100">
            Dica: Confira se o bairro está escrito corretamente
          </div>
        </div>
      </div>
    );
  }

  const visibleMarkets = markets.slice(0, visibleCount);
  const hasMore = visibleCount < markets.length;

  return (
    <div className="max-w-7xl mx-auto py-[2rem]">
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 px-4 sm:px-6 lg:px-8">
        {visibleMarkets.map((market, idx) => (
          <li key={market.id}>
            <MarketCard 
              market={market} 
              userLat={userLat} 
              userLon={userLon}
              index={idx}
            />
          </li>
        ))}
      </ul>

      {hasMore && (
        <div className="mt-[4rem] mb-[2rem] flex justify-center px-4">
          <button
            onClick={() => setVisibleCount(prev => prev + ITEMS_PER_PAGE)}
            aria-label={`Ver mais ${ITEMS_PER_PAGE} feiras`}
            className="group flex items-center gap-3 bg-white hover:bg-orange-500 text-orange-700 hover:text-white px-8 py-4 rounded-2xl font-black text-lg transition-all shadow-xl hover:shadow-orange-200 border-2 border-orange-100 hover:border-orange-500 focus-visible:ring-4 focus-visible:ring-orange-500 focus:outline-none active:scale-95"
          >
            <span>Ver mais feiras</span>
            <ChevronDown className="group-hover:translate-y-1 transition-transform" aria-hidden="true" />
          </button>
        </div>
      )}
      
      {!hasMore && markets.length > ITEMS_PER_PAGE && (
        <p className="text-center text-gray-600 font-bold text-sm mt-[3rem] mb-[2rem] uppercase tracking-widest" role="status">
          <span aria-hidden="true">✨</span> Você chegou ao fim da lista
        </p>
      )}
    </div>
  );
}
