import { useState, useRef, useMemo } from 'react';
import { X, MapPin, Search } from 'lucide-react';
import confetti from 'canvas-confetti';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DIAS = ['Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado', 'Domingo'];

// Custom emoji marker for the modal
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
    iconAnchor: [18, 36],
    popupAnchor: [0, -36]
  });
};

function ModalMapUpdater({ center }) {
  const map = useMap();
  // Only update view if center is provided and valid
  if (center && center[0] && center[1]) {
    // Check if current center is different to avoid infinite loops
    const currentCenter = map.getCenter();
    if (Math.abs(currentCenter.lat - center[0]) > 0.0001 || Math.abs(currentCenter.lng - center[1]) > 0.0001) {
      map.setView(center, 16);
    }
  }
  return null;
}

export default function AddMarketModal({ isOpen, onClose, onAdd }) {
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isMapVisible, setIsMapVisible] = useState(false);
  const [pinLocation, setPinLocation] = useState(null); // {lat, lng}
  const markerRef = useRef(null);

  const [formData, setFormData] = useState({
    address: '',
    bairro: '',
    day: 'Sexta-Feira',
    timeStart: '07:00',
    timeEnd: '13:00',
    ra: 'Outra'
  });

  const markerIcon = useMemo(() => createEmojiIcon('📍', '#22c55e'), []);

  if (!isOpen) return null;

  const handleSearchLocation = async () => {
    if (!formData.address || !formData.bairro) {
      alert("Por favor, preencha o endereço e o bairro primeiro.");
      return;
    }

    setIsGeocoding(true);
    let lat = null;
    let lng = null;

    try {
      const fullQuery = `${formData.address}, ${formData.bairro}, Rio de Janeiro, Brazil`;
      let response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullQuery)}&limit=1`);
      let data = await response.json();

      if (data && data.length > 0) {
        lat = parseFloat(data[0].lat);
        lng = parseFloat(data[0].lon);
      } else {
        const fallbackQuery = `${formData.bairro}, Rio de Janeiro, Brazil`;
        response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fallbackQuery)}&limit=1`);
        data = await response.json();
        
        if (data && data.length > 0) {
          lat = parseFloat(data[0].lat);
          lng = parseFloat(data[0].lon);
        }
      }
    } catch (error) {
      console.error("Geocoding failed entirely:", error);
    }

    if (lat && lng) {
      setPinLocation({ lat, lng });
      setIsMapVisible(true);
    } else {
      alert("Não foi possível encontrar este local no mapa. Tente ser mais específico no bairro.");
    }

    setIsGeocoding(false);
  };

  const handleDragEnd = () => {
    const marker = markerRef.current;
    if (marker != null) {
      const position = marker.getLatLng();
      setPinLocation({ lat: position.lat, lng: position.lng });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // If the user didn't use the map, try to geocode silently one last time
    let finalLat = pinLocation?.lat || null;
    let finalLng = pinLocation?.lng || null;

    if (!finalLat || !finalLng) {
      setIsGeocoding(true);
      try {
        const fullQuery = `${formData.address}, ${formData.bairro}, Rio de Janeiro, Brazil`;
        let response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullQuery)}&limit=1`);
        let data = await response.json();

        if (data && data.length > 0) {
          finalLat = parseFloat(data[0].lat);
          finalLng = parseFloat(data[0].lon);
        } else {
          const fallbackQuery = `${formData.bairro}, Rio de Janeiro, Brazil`;
          response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fallbackQuery)}&limit=1`);
          data = await response.json();
          if (data && data.length > 0) {
            finalLat = parseFloat(data[0].lat);
            finalLng = parseFloat(data[0].lon);
          }
        }
      } catch (error) {
        console.error("Silent geocoding failed:", error);
      }
      setIsGeocoding(false);
    }
    
    onAdd({
      address: formData.address,
      bairro: formData.bairro,
      day: formData.day,
      hours: `${formData.timeStart}–${formData.timeEnd}`,
      ra: formData.ra,
      lat: finalLat,
      lng: finalLng,
      isCommunityAdded: true
    });

    confetti({
      particleCount: 150,
      spread: 90,
      origin: { y: 0.6 },
      colors: ['#22c55e', '#f97316', '#eab308']
    });

    handleClose();
  };

  const handleClose = () => {
    setFormData({ address: '', bairro: '', day: 'Sexta-Feira', timeStart: '07:00', timeEnd: '13:00', ra: 'Outra' });
    setPinLocation(null);
    setIsMapVisible(false);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-orange-900/40 backdrop-blur-sm"
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="modal-title"
    >
      <div className="bg-white rounded-[1.5rem] shadow-2xl w-full max-w-md overflow-hidden ring-4 ring-white/50 animate-in fade-in zoom-in-95 duration-200 max-h-[95vh] flex flex-col">
        
        <div className="flex justify-between items-center px-6 py-4 bg-gradient-to-r from-orange-50 to-yellow-50 border-b border-orange-100 shrink-0">
          <div>
            <h2 id="modal-title" className="text-xl font-black text-orange-900 flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">✨</span> Sugerir Feira
            </h2>
          </div>
          <button 
            onClick={handleClose} 
            aria-label="Fechar formulário de sugestão"
            className="p-2 -mr-2 bg-white rounded-full hover:bg-orange-100 text-orange-700 hover:text-orange-900 transition-colors shadow-sm focus-visible:ring-2 focus-visible:ring-orange-500 outline-none"
          >
            <X size={18} strokeWidth={3} aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 flex-1 custom-scrollbar">
          <form id="add-market-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="market-address" className="block text-sm font-bold text-gray-700 mb-1.5 cursor-pointer">Endereço</label>
              <input 
                id="market-address"
                required
                aria-required="true"
                type="text" 
                className="w-full rounded-xl border-2 border-orange-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all placeholder:text-gray-500 font-medium"
                placeholder="Ex: Rua Voluntários da Pátria"
                value={formData.address}
                onChange={e => {
                  setFormData({...formData, address: e.target.value});
                  setIsMapVisible(false); // Hide map if address changes
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="market-bairro" className="block text-sm font-bold text-gray-700 mb-1.5 cursor-pointer">Bairro</label>
                <input 
                  id="market-bairro"
                  required
                  aria-required="true"
                  type="text" 
                  className="w-full rounded-xl border-2 border-orange-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all placeholder:text-gray-500 font-medium"
                  placeholder="Ex: Botafogo"
                  value={formData.bairro}
                  onChange={e => {
                    setFormData({...formData, bairro: e.target.value});
                    setIsMapVisible(false);
                  }}
                />
              </div>
              <div>
                <label htmlFor="market-day" className="block text-sm font-bold text-gray-700 mb-1.5 cursor-pointer">Dia</label>
                <select 
                  id="market-day"
                  className="w-full rounded-xl border-2 border-orange-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white transition-all text-gray-700 font-bold"
                  value={formData.day}
                  onChange={e => setFormData({...formData, day: e.target.value})}
                >
                  {DIAS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div className="pt-2">
              {!isMapVisible ? (
                <button
                  type="button"
                  onClick={handleSearchLocation}
                  disabled={isGeocoding}
                  className="w-full flex items-center justify-center gap-2 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 font-bold py-2.5 px-4 rounded-xl transition-all shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500 outline-none disabled:opacity-50"
                >
                  <MapPin size={18} />
                  {isGeocoding ? 'Buscando...' : 'Verificar e Ajustar no Mapa'}
                </button>
              ) : (
                <div className="border-2 border-orange-500 rounded-xl overflow-hidden shadow-inner flex flex-col">
                  <div className="bg-orange-50 px-3 py-2 text-xs font-bold text-orange-800 flex justify-between items-center border-b border-orange-200">
                    <span>Arraste o pino para a posição exata</span>
                    <button type="button" onClick={() => setIsMapVisible(false)} className="text-orange-600 hover:text-orange-900"><X size={14} /></button>
                  </div>
                  <div className="h-[200px] w-full relative z-0">
                    <MapContainer 
                      center={pinLocation ? [pinLocation.lat, pinLocation.lng] : [-22.9068, -43.1729]} 
                      zoom={15} 
                      scrollWheelZoom={true}
                      className="h-full w-full"
                    >
                      <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                      />
                      <ModalMapUpdater center={pinLocation ? [pinLocation.lat, pinLocation.lng] : null} />
                      {pinLocation && (
                        <Marker 
                          position={[pinLocation.lat, pinLocation.lng]} 
                          icon={markerIcon}
                          draggable={true}
                          eventHandlers={{ dragend: handleDragEnd }}
                          ref={markerRef}
                        />
                      )}
                    </MapContainer>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label htmlFor="time-start" className="block text-sm font-bold text-gray-700 mb-1.5 cursor-pointer">Início</label>
                <input 
                  id="time-start"
                  required
                  aria-required="true"
                  type="time" 
                  className="w-full rounded-xl border-2 border-orange-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all text-gray-700 font-medium"
                  value={formData.timeStart}
                  onChange={e => setFormData({...formData, timeStart: e.target.value})}
                />
              </div>
              <div>
                <label htmlFor="time-end" className="block text-sm font-bold text-gray-700 mb-1.5 cursor-pointer">Fim</label>
                <input 
                  id="time-end"
                  required
                  aria-required="true"
                  type="time" 
                  className="w-full rounded-xl border-2 border-orange-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all text-gray-700 font-medium"
                  value={formData.timeEnd}
                  onChange={e => setFormData({...formData, timeEnd: e.target.value})}
                />
              </div>
            </div>
          </form>
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100 shrink-0 flex gap-3">
          <button 
            type="button"
            onClick={handleClose}
            className="w-1/3 px-4 py-3 text-sm font-bold text-gray-700 bg-white border-2 border-gray-200 rounded-xl hover:bg-gray-50 transition-colors focus-visible:ring-2 focus-visible:ring-gray-500 outline-none"
          >
            Cancelar
          </button>
          <button 
            type="submit"
            form="add-market-form"
            disabled={isGeocoding}
            className="w-2/3 bg-green-600 hover:bg-green-700 text-white font-black py-3 px-4 rounded-xl transition-all shadow-md hover:shadow-lg focus-visible:ring-2 focus-visible:ring-green-500 outline-none disabled:opacity-70 disabled:cursor-wait"
          >
            {isGeocoding ? 'Salvando...' : 'Salvar Feira'}
          </button>
        </div>

      </div>
    </div>
  );
}
