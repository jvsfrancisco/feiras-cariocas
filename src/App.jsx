import { useState, useEffect, useMemo } from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import FilterBar from './components/FilterBar';
import MarketList from './components/MarketList';
import MarketMap from './components/MarketMap';
import AddMarketModal from './components/AddMarketModal';
import { useMarkets } from './hooks/useMarkets';
import { sortMarketsByDistance } from './utils/distance';
import { appendCoordinates } from './utils/geocoding';

export default function App() {
  const { markets, addMarket } = useMarkets();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDay, setSelectedDay] = useState('Todos');
  const [viewMode, setViewMode] = useState('list');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);

  // Ask for location on mount if not already asked/granted
  useEffect(() => {
    // Only ask if we don't have it
    if (!userLocation && !locationError && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.warn("Geolocation blocked or failed:", error.message);
          setLocationError(true);
        }
      );
    }
  }, []);

  // Set 'Today' as default filter on first load
  useEffect(() => {
    const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });
    // Capitalize correctly to match our DAYS array
    const formattedToday = today.charAt(0).toUpperCase() + today.slice(1);
    if (formattedToday !== selectedDay && selectedDay === 'Todos') {
      setSelectedDay(formattedToday);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Process and Filter Markets
  const processedMarkets = useMemo(() => {
    // 1. Add coordinates
    let withCoords = appendCoordinates(markets);

    // 2. Filter by search term
    if (searchTerm) {
      const normalize = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
      const term = normalize(searchTerm);
      withCoords = withCoords.filter(m => 
        normalize(m.bairro).includes(term) || 
        normalize(m.address).includes(term) ||
        normalize(m.ra).includes(term)
      );
    }

    // 3. Filter by day
    if (selectedDay !== 'Todos') {
      withCoords = withCoords.filter(m => m.day === selectedDay);
    }

    // 4. Sort by distance if we have location
    if (userLocation) {
      withCoords = sortMarketsByDistance(withCoords, userLocation.lat, userLocation.lng);
      // Add distance property to each object for the card to display
      withCoords = withCoords.map(m => {
        if (!m.lat || !m.lng) return m;
        // Import distance calculator locally just for this inline usage since we didn't export it globally
        const R = 6371; 
        const dLat = (m.lat - userLocation.lat) * (Math.PI/180);
        const dLon = (m.lng - userLocation.lng) * (Math.PI/180); 
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(userLocation.lat * (Math.PI/180)) * Math.cos(m.lat * (Math.PI/180)) * 
                  Math.sin(dLon/2) * Math.sin(dLon/2); 
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
        return { ...m, distance: R * c };
      });
    } else {
       // If no location, sort alphabetically by bairro
       withCoords = withCoords.sort((a,b) => a.bairro.localeCompare(b.bairro));
    }

    return withCoords;
  }, [markets, searchTerm, selectedDay, userLocation]);

  // Swipe logic
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const handleTouchStart = (e) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 70;
    const isRightSwipe = distance < -70;

    if (isLeftSwipe && viewMode === 'list') {
      setViewMode('map');
    }
    if (isRightSwipe && viewMode === 'map') {
      // Allow swipe from left edge to go back to list (iOS style)
      if (touchStart < 60) {
        setViewMode('list');
      }
    }
    setTouchStart(null);
    setTouchEnd(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FEFAE0]">
      <Header 
        onAddClick={() => setIsAddModalOpen(true)} 
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        viewMode={viewMode}
      />
      
      <main 
        className={`flex-1 flex flex-col relative ${viewMode === 'map' ? 'h-screen overflow-hidden' : 'overflow-x-hidden'}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div 
          key={viewMode} 
          className={`flex-1 flex flex-col w-full ${viewMode === 'list' ? 'animate-slide-left' : 'animate-slide-right'}`}
        >
          {viewMode === 'list' ? (
            <>
              <Hero searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
              <FilterBar 
                selectedDay={selectedDay} 
                setSelectedDay={setSelectedDay}
                viewMode={viewMode}
                setViewMode={setViewMode}
              />
              <MarketList 
                markets={processedMarkets} 
                userLat={userLocation?.lat} 
                userLon={userLocation?.lng} 
              />
            </>
          ) : (
            <>
              <FilterBar 
                selectedDay={selectedDay} 
                setSelectedDay={setSelectedDay}
                viewMode={viewMode}
                setViewMode={setViewMode}
              />
              <MarketMap 
                markets={processedMarkets} 
                userLat={userLocation?.lat} 
                userLon={userLocation?.lng}
              />
            </>
          )}
        </div>
      </main>

      {/* Footer - Only visible in list mode */}
      {viewMode === 'list' && (
        <footer className="bg-gradient-to-b from-green-800 to-green-950 text-green-50 py-12 px-6 text-center text-sm font-medium border-t border-green-700/30">
          <div className="max-w-7xl mx-auto flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🍉</span>
              <span className="text-lg font-black tracking-tight bg-gradient-to-r from-orange-400 to-green-400 bg-clip-text text-transparent">
                Feiras Cariocas
              </span>
            </div>
            <p className="max-w-md mx-auto text-green-100/70 leading-relaxed">
              Nossa missão é facilitar o acesso a alimentos frescos e fortalecer a economia local do Rio de Janeiro.
            </p>
            <div className="h-px w-24 bg-green-700/50 my-2"></div>
            <p className="font-bold">Desenvolvido com 💚 para os cariocas</p>
            <p className="opacity-50 text-[11px] uppercase tracking-widest mt-2">
              © {new Date().getFullYear()} • Dados da Prefeitura do Rio
            </p>
          </div>
        </footer>
      )}

      <AddMarketModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onAdd={addMarket}
      />
    </div>
  );
}
