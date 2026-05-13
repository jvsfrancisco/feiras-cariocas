import MarketCard from './MarketCard';

export default function MarketList({ markets, userLat, userLon }) {
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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto">
      {markets.map((market, idx) => (
        <MarketCard 
          key={market.id} 
          market={market} 
          userLat={userLat} 
          userLon={userLon}
          index={idx}
        />
      ))}
    </div>
  );
}
