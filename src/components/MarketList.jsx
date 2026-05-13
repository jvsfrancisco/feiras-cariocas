import MarketCard from './MarketCard';

export default function MarketList({ markets, userLat, userLon }) {
  if (markets.length === 0) {
    return (
      <div className="text-center py-20 px-4">
        <span className="text-6xl mb-4 block">😢</span>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Nenhuma feira encontrada</h3>
        <p className="text-gray-500">Tente mudar os filtros ou busque por outro bairro.</p>
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
