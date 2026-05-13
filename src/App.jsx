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

  return (
    <div className="min-h-screen flex flex-col bg-[#FEFAE0]">
      <Header 
        onAddClick={() => setIsAddModalOpen(true)} 
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        viewMode={viewMode}
      />
      
      {viewMode === 'list' && (
        <Hero searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
      )}

      <FilterBar 
        selectedDay={selectedDay} 
        setSelectedDay={setSelectedDay}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      <main className="flex-1 relative">
        {viewMode === 'list' ? (
          <MarketList 
            markets={processedMarkets} 
            userLat={userLocation?.lat} 
            userLon={userLocation?.lng} 
          />
        ) : (
          <MarketMap 
            markets={processedMarkets} 
            userLat={userLocation?.lat} 
            userLon={userLocation?.lng}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-[#2D6A4F] text-green-50 py-8 text-center text-sm font-medium mt-12">
        <p>Desenvolvido com 💚 para os cariocas</p>
        <p className="opacity-80 mt-1">Dados da Prefeitura do Rio + contribuições da comunidade</p>
      </footer>

      <AddMarketModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onAdd={addMarket}
      />
    </div>
  );
}
