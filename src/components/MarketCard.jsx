import { Navigation } from 'lucide-react';

const DAY_COLORS = {
  'Segunda-Feira': 'bg-slate-100 text-slate-800 border-slate-200',
  'Terça-Feira': 'bg-orange-100 text-orange-800 border-orange-200',
  'Quarta-Feira': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Quinta-Feira': 'bg-green-100 text-green-800 border-green-200',
  'Sexta-Feira': 'bg-blue-100 text-blue-800 border-blue-200',
  'Sábado': 'bg-purple-100 text-purple-800 border-purple-200',
  'Domingo': 'bg-red-100 text-red-800 border-red-200',
};

const RANDOM_EMOJIS = ['🍎', '🥬', '🥕', '🍇', '🌽', '🍊', '🥑', '🍅'];

export default function MarketCard({ market, userLat, userLon, index = 0 }) {
  const dayColor = DAY_COLORS[market.day] || 'bg-gray-100 text-gray-800 border-gray-200';
  
  // Deterministic emoji based on id or address length so it doesn't change on render
  const emoji = RANDOM_EMOJIS[(market.address.length) % RANDOM_EMOJIS.length];

  const handleDirections = (e, mode = 'driving') => {
    e.stopPropagation();
    if (userLat && userLon) {
      const url = `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLon}&destination=${encodeURIComponent(market.address + ', ' + market.bairro + ', Rio de Janeiro')}&travelmode=${mode}`;
      window.open(url, '_blank');
    } else {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(market.address + ', ' + market.bairro + ', Rio de Janeiro')}`;
      window.open(url, '_blank');
    }
  };

  const staggerClass = index % 3 === 0 ? '' : index % 3 === 1 ? 'stagger-1' : 'stagger-2';

  return (
    <div className={`bg-white rounded-3xl shadow-sm border-2 border-orange-50 overflow-hidden hover-bounce flex flex-col h-full transition-all group animate-fade-in opacity-0 ${staggerClass}`}>
      <div className="p-6 flex-1">
        <div className="flex justify-between items-start mb-4">
          <span className={`text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-md border ${dayColor.replace('bg-', 'bg-transparent text-').replace('text-800', 'text-700 opacity-80')}`}>
            {market.day}
          </span>
          {market.isCommunityAdded && (
            <span className="text-[10px] uppercase tracking-wider font-extrabold bg-green-50 text-green-700 border border-green-100 px-2.5 py-1 rounded-md flex items-center gap-1">
              🌟 Sugerida
            </span>
          )}
        </div>

        <h3 className="text-xl font-black text-gray-900 mb-3 line-clamp-2 group-hover:text-orange-600 transition-colors flex items-center gap-3">
          <span className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-orange-50 rounded-xl text-xl transition-all group-hover:bg-orange-100 overflow-visible">
            <span className="transition-transform duration-300 group-hover:scale-125">{emoji}</span>
          </span>
          <span>Feira {market.bairro}</span>
        </h3>
        
        <div className="space-y-4 mt-6 text-sm text-gray-700 font-medium border-l-2 border-gray-100 pl-4 ml-1">
          <div className="flex flex-col gap-0.5">
            <span className="text-gray-400 text-[10px] uppercase font-bold tracking-widest">Localização</span>
            <span className="font-bold text-gray-900 leading-tight">{market.address}</span>
            <span className="text-gray-500 text-xs">{market.bairro} • {market.ra}</span>
          </div>
          
          <div className="flex flex-col gap-0.5">
            <span className="text-gray-400 text-[10px] uppercase font-bold tracking-widest">Horário</span>
            <span className="font-bold text-gray-800">{market.hours}</span>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 bg-gray-50/50 border-t border-gray-100 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          {market.distance !== undefined ? (
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Distância</span>
              <span className="text-sm font-black text-green-600">
                {market.distance.toFixed(1)} km
              </span>
            </div>
          ) : (
            <span className="text-sm text-gray-400 font-medium">—</span>
          )}
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
            <Navigation className="w-3 h-3" />
            Google Maps
          </div>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={(e) => handleDirections(e, 'driving')}
            aria-label="Como chegar de carro"
            className="flex-1 py-2 px-2 bg-white text-gray-600 hover:text-orange-600 hover:border-orange-200 border border-gray-200 rounded-xl font-bold text-[11px] shadow-sm transition-all flex items-center justify-center gap-1 group/btn whitespace-nowrap"
          >
            <span className="text-base group-hover/btn:scale-110 transition-transform">🚗</span> 
            <span>Carro</span>
          </button>
          <button 
            onClick={(e) => handleDirections(e, 'walking')}
            aria-label="Como chegar a pé ou com acessibilidade"
            className="flex-1 py-2 px-2 bg-white text-gray-600 hover:text-orange-600 hover:border-orange-200 border border-gray-200 rounded-xl font-bold text-[11px] shadow-sm transition-all flex items-center justify-center gap-1 group/btn whitespace-nowrap"
          >
            <span className="text-base group-hover/btn:scale-110 transition-transform">🚶</span> 
            <span>A pé</span>
          </button>
          <button 
            onClick={(e) => handleDirections(e, 'bicycling')}
            aria-label="Como chegar de bicicleta"
            className="flex-1 py-2 px-2 bg-white text-gray-600 hover:text-orange-600 hover:border-orange-200 border border-gray-200 rounded-xl font-bold text-[11px] shadow-sm transition-all flex items-center justify-center gap-1 group/btn whitespace-nowrap"
          >
            <span className="text-base group-hover/btn:scale-110 transition-transform">🚲</span> 
            <span>Bike</span>
          </button>
        </div>
      </div>
    </div>
  );
}
