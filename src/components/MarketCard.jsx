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
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${dayColor}`}>
            {market.day}
          </span>
          {market.isCommunityAdded && (
            <span className="text-xs font-bold bg-green-100 text-green-800 border border-green-200 px-3 py-1.5 rounded-full flex items-center gap-1">
              🌟 Sugerida
            </span>
          )}
        </div>

        <h3 className="text-xl font-extrabold text-gray-900 mb-2 line-clamp-2 group-hover:text-orange-600 transition-colors">
          <span className="mr-2">{emoji}</span>
          Feira {market.bairro}
        </h3>
        
        <div className="space-y-3 mt-5 text-sm text-gray-700 font-medium">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-lg leading-none">📍</span>
            <span>
              <span className="font-bold text-gray-900">{market.address}</span><br/>
              <span className="text-gray-500">{market.bairro} • {market.ra}</span>
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-lg leading-none">⏰</span>
            <span>{market.hours}</span>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 bg-orange-50/50 border-t-2 border-orange-50 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          {market.distance !== undefined ? (
            <span className="text-sm font-black text-green-600 bg-green-100 px-3 py-1 rounded-full whitespace-nowrap">
              {market.distance.toFixed(1)} km
            </span>
          ) : (
            <span className="text-sm text-gray-400 font-medium whitespace-nowrap">—</span>
          )}
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <Navigation className="w-3 h-3" />
            Google Maps
          </div>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={(e) => handleDirections(e, 'driving')}
            className="flex-1 py-1.5 px-2 bg-white text-gray-700 hover:text-orange-600 hover:border-orange-200 border border-gray-200 rounded-xl font-bold text-xs shadow-sm transition-all text-center flex items-center justify-center gap-1"
          >
            <span className="text-sm">🚗</span> Carro
          </button>
          <button 
            onClick={(e) => handleDirections(e, 'walking')}
            className="flex-1 py-1.5 px-2 bg-white text-gray-700 hover:text-orange-600 hover:border-orange-200 border border-gray-200 rounded-xl font-bold text-xs shadow-sm transition-all text-center flex items-center justify-center gap-1"
          >
            <span className="text-sm">🚶</span> A pé
          </button>
          <button 
            onClick={(e) => handleDirections(e, 'bicycling')}
            className="flex-1 py-1.5 px-2 bg-white text-gray-700 hover:text-orange-600 hover:border-orange-200 border border-gray-200 rounded-xl font-bold text-xs shadow-sm transition-all text-center flex items-center justify-center gap-1"
          >
            <span className="text-sm">🚲</span> Bike
          </button>
        </div>
      </div>
    </div>
  );
}
