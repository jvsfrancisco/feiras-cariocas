import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Navigation, ExternalLink, Map as MapIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

// Custom emoji marker
const createEmojiIcon = (emoji, colorStr) => {
  return L.divIcon({
    className: 'custom-emoji-marker',
    html: `
      <div style="
        background-color: ${colorStr}; 
        width: 36px; 
        height: 36px; 
        border-radius: 50%; 
        border: 3px solid white; 
        box-shadow: 0 4px 10px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        transition: transform 0.2s;
      ">
        ${emoji}
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  });
};

const EMOJIS = ['🍎', '🥬', '🥕', '🍇', '🌽', '🍊', '🥑', '🍅'];

const DAY_COLORS_HEX = {
  'Segunda-Feira': '#475569', // slate-600
  'Terça-Feira': '#f97316',   // orange-500
  'Quarta-Feira': '#eab308',  // yellow-500
  'Quinta-Feira': '#22c55e',  // green-500
  'Sexta-Feira': '#3b82f6',   // blue-500
  'Sábado': '#a855f7',        // purple-500
  'Domingo': '#ef4444',       // red-500
};


// Component to dynamically update map center
function MapUpdater({ center, route }) {
  const map = useMap();
  const [hasCenteredOnce, setHasCenteredOnce] = useState(false);

  useEffect(() => {
    if (route && route.length > 0) {
      const bounds = L.latLngBounds(route);
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (center && !hasCenteredOnce) {
      // Only center automatically once when location is found
      map.setView(center, 14); 
      setHasCenteredOnce(true);
    }
  }, [center, route, map, hasCenteredOnce]);

  return null;
}

export default function MarketMap({ markets, userLat, userLon }) {
  const center = userLat && userLon ? [userLat, userLon] : [-22.9068, -43.1729]; 
  const [activeRoute, setActiveRoute] = useState(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [travelMode, setTravelMode] = useState('driving');

  useEffect(() => {
    setActiveRoute(null);
  }, [markets]);

  const handleFetchRoute = async (marketLat, marketLon, overrideMode) => {
    if (!userLat || !userLon) return;
    
    const modeToUse = overrideMode || travelMode;
    setIsLoadingRoute(true);
    try {
      // OSRM requires coords as longitude,latitude
      const url = `https://router.project-osrm.org/route/v1/${modeToUse}/${userLon},${userLat};${marketLon},${marketLat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.routes && data.routes.length > 0) {
        // GeoJSON gives [lng, lat], Leaflet needs [lat, lng]
        const coords = data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
        setActiveRoute(coords);
      }
    } catch (err) {
      console.error("Failed to fetch route", err);
      alert("Não foi possível carregar a rota no momento.");
    } finally {
      setIsLoadingRoute(false);
    }
  };

  return (
    <div className="flex-1 w-full z-0 relative group flex flex-col min-h-0">
      <MapContainer 
        center={center} 
        zoom={12} 
        scrollWheelZoom={true}
        dragging={true}
        className="flex-1 w-full"
      >
        <TileLayer
          className="vibrant-tiles"
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        
        <MapUpdater center={center} route={activeRoute} />

        {activeRoute && (
          <Polyline positions={activeRoute} color="#3b82f6" weight={5} opacity={0.8} dashArray="10, 10" />
        )}

        {userLat && userLon && (
          <Marker 
            position={[userLat, userLon]} 
            icon={createEmojiIcon('📍', '#111827')}
            alt="Sua localização atual"
          >
            <Popup className="vibrant-popup">
              <div className="p-3 text-center font-bold text-[0.9rem]">Você está aqui</div>
            </Popup>
          </Marker>
        )}

        {markets.map(market => {
          if (!market.lat || !market.lng) return null;
          
          const emoji = EMOJIS[(market.address.length) % EMOJIS.length];
          const color = DAY_COLORS_HEX[market.day] || '#f97316';
          
          return (
            <Marker 
              key={market.id} 
              position={[market.lat, market.lng]}
              icon={createEmojiIcon(emoji, color)}
              alt={`Feira de ${market.bairro} em ${market.address} no dia ${market.day}`}
              eventHandlers={{
                click: () => setActiveRoute(null)
              }}
            >
              <Popup className="vibrant-popup">
                <div className="p-1 min-w-[15rem]">
                  <h4 className="font-black text-gray-900 mb-3 text-lg flex items-center gap-2 border-b border-gray-100 pb-2">
                    <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-gray-50 rounded-lg text-lg grayscale-0" aria-hidden="true">{emoji}</span>
                    <span>Feira {market.bairro}</span>
                  </h4>
                  
                  <div className="space-y-3 mb-5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[0.65rem] uppercase font-bold text-gray-700 tracking-wider">Localização</span>
                      <span className="text-sm font-bold text-gray-800 leading-tight">{market.address}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[0.65rem] uppercase font-bold text-gray-700 tracking-wider">Horário</span>
                      <span className="text-sm font-bold text-gray-800 bg-orange-50 px-2 py-0.5 rounded-md self-start">
                        {market.day} • {market.hours}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2.5">
                    {userLat && userLon ? (
                      <>
                        <nav className="flex gap-2 p-1 bg-gray-50 rounded-xl border border-gray-100" aria-label="Modo de transporte">
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setTravelMode('driving'); 
                              if (activeRoute) handleFetchRoute(market.lat, market.lng, 'driving');
                            }}
                            aria-label="Calcular rota de carro"
                            aria-pressed={travelMode === 'driving'}
                            className={`flex-1 py-1.5 px-1 rounded-lg text-[0.65rem] font-bold transition-all focus-visible:ring-2 focus-visible:ring-orange-500 outline-none ${travelMode === 'driving' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                          >
                            <span aria-hidden="true">🚗</span> Carro
                          </button>
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setTravelMode('walking'); 
                              if (activeRoute) handleFetchRoute(market.lat, market.lng, 'walking');
                            }}
                            aria-label="Calcular rota a pé"
                            aria-pressed={travelMode === 'walking'}
                            className={`flex-1 py-1.5 px-1 rounded-lg text-[0.65rem] font-bold transition-all focus-visible:ring-2 focus-visible:ring-orange-500 outline-none ${travelMode === 'walking' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                          >
                            <span aria-hidden="true">🚶</span> A pé
                          </button>
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setTravelMode('cycling'); 
                              if (activeRoute) handleFetchRoute(market.lat, market.lng, 'cycling');
                            }}
                            aria-label="Calcular rota de bicicleta"
                            aria-pressed={travelMode === 'cycling'}
                            className={`flex-1 py-1.5 px-1 rounded-lg text-[0.65rem] font-bold transition-all focus-visible:ring-2 focus-visible:ring-orange-500 outline-none ${travelMode === 'cycling' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                          >
                            <span aria-hidden="true">🚲</span> Bike
                          </button>
                        </nav>
                        <button 
                          onClick={() => handleFetchRoute(market.lat, market.lng)}
                          disabled={isLoadingRoute}
                          aria-label={isLoadingRoute ? 'Calculando rota' : `Ver rota de ${travelMode} no mapa`}
                          className="flex items-center gap-2 text-white px-4 py-2.5 rounded-xl font-bold transition-all w-full justify-center shadow-md hover:shadow-lg focus-visible:ring-2 focus-visible:ring-orange-500 outline-none active:scale-95 disabled:opacity-50"
                          style={{ backgroundColor: color }}
                        >
                          <MapIcon size={16} aria-hidden="true" className={isLoadingRoute ? 'animate-spin' : ''} /> 
                          <span role="status">{isLoadingRoute ? 'Calculando...' : 'Ver Rota no Mapa'}</span>
                        </button>
                      </>
                    ) : (
                      <div className="text-[0.65rem] text-orange-900 bg-orange-50 py-2 px-3 rounded-lg font-black text-center border border-orange-100" role="alert">
                        <span aria-hidden="true">⚠️</span> Ative sua localização para ver rotas
                      </div>
                    )}
                    
                    <a 
                      href={`https://www.google.com/maps/dir/?api=1&origin=${userLat||''},${userLon||''}&destination=${market.lat},${market.lng}&travelmode=${travelMode === 'cycling' ? 'bicycling' : travelMode}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Abrir direções no aplicativo Google Maps"
                      className="flex items-center gap-2 bg-gray-50 text-gray-700 hover:text-gray-900 px-4 py-2 rounded-xl font-bold transition-colors w-full justify-center text-[0.7rem] border border-gray-100 focus-visible:ring-2 focus-visible:ring-gray-500 outline-none"
                    >
                      <ExternalLink size={14} aria-hidden="true" /> Abrir no Google Maps
                    </a>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
