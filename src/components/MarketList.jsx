import { useState, useEffect } from 'react';
import MarketCard from './MarketCard';
import { ChevronDown } from 'lucide-react';

export default function MarketList({ markets, userLat, userLon }) {
  const ITEMS_PER_PAGE = 12;
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  // Reset count when markets change (e.g. filter or search)
  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [markets]);

  if (markets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center animate-fade-in">
        <div className="w-24 h-24 bg-orange-50 rounded-full flex items-center justify-center text-5xl mb-6 shadow-inner ring-8 ring-orange-50/50">
          🔍
        </div>
        <h3 className="text-2xl font-black text-gray-900 mb-3">
          Ops! Nenhuma feira por aqui
        </h3>
        <p className="text-gray-500 max-w-xs mx-auto leading-relaxed font-medium">
          Não encontramos feiras com esses filtros. Que tal tentar outro bairro ou dia da semana?
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <div className="text-xs font-bold text-orange-400 uppercase tracking-widest bg-orange-50 px-4 py-2 rounded-full border border-orange-100">
            Dica: Confira se o bairro está escrito corretamente
          </div>
        </div>
      </div>
    );
  }

  const visibleMarkets = markets.slice(0, visibleCount);
  const hasMore = visibleCount < markets.length;

  return (
    <div className="max-w-7xl mx-auto py-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 px-4 sm:px-6 lg:px-8">
        {visibleMarkets.map((market, idx) => (
          <MarketCard 
            key={market.id} 
            market={market} 
            userLat={userLat} 
            userLon={userLon}
            index={idx}
          />
        ))}
      </div>

      {hasMore && (
        <div className="mt-16 mb-8 flex justify-center px-4">
          <button
            onClick={() => setVisibleCount(prev => prev + ITEMS_PER_PAGE)}
            className="group flex items-center gap-3 bg-white hover:bg-orange-500 text-orange-500 hover:text-white px-8 py-4 rounded-2xl font-black text-lg transition-all shadow-xl hover:shadow-orange-200 border-2 border-orange-100 hover:border-orange-500 active:scale-95"
          >
            <span>Ver mais feiras</span>
            <ChevronDown className="group-hover:translate-y-1 transition-transform" />
          </button>
        </div>
      )}
      
      {!hasMore && markets.length > ITEMS_PER_PAGE && (
        <p className="text-center text-gray-400 font-bold text-sm mt-12 mb-8 uppercase tracking-widest">
          ✨ Você chegou ao fim da lista
        </p>
      )}
    </div>
  );
}
