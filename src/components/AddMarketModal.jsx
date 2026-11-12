import { useState, useRef, useEffect } from 'react';
import { X, MapPin } from 'lucide-react';
import confetti from 'canvas-confetti';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { pinoEdicaoIcone } from '../utils/mapIcons';
import AvisoPrivacidade from './AvisoPrivacidade';
import { aceitarPrivacidade, backendAtivo, mensagemParaCodigo, privacidadeAceita, sugerirFeira } from '../api';
import { diaAtualSaoPaulo, diaNumero, encontrarDuplicada, localizacaoAtual } from '../utils/sugestoes';
import { dentroDoHorarioDaFeira } from '../utils/confirmacoes';

const DIAS = ['Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado', 'Domingo'];

const iconeEdicao = pinoEdicaoIcone();

const CAMPO =
  'w-full rounded-[10px] border border-[#B8A892] bg-papel px-3 h-12 text-sm focus:outline-none focus:ring-2 focus:ring-verde focus:border-verde transition-all placeholder:text-tinta-2 font-medium text-tinta';

function ModalMapUpdater({ lat, lng }) {
  const map = useMap();

  useEffect(() => {
    if (lat == null || lng == null) return;
    const atual = map.getCenter();
    // Evita redefinir a vista quando o centro já está no lugar
    if (Math.abs(atual.lat - lat) > 0.0001 || Math.abs(atual.lng - lng) > 0.0001) {
      map.setView([lat, lng], 16);
    }
  }, [lat, lng, map]);

  return null;
}

export default function AddMarketModal({ isOpen, onClose, onAdd, onEnviado, onVerFeira, markets = [], onApagarDados }) {
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isMapVisible, setIsMapVisible] = useState(false);
  const [pinLocation, setPinLocation] = useState(null); // {lat, lng}
  const markerRef = useRef(null);
  const anteriorRef = useRef(null);
  const dialogRef = useRef(null);
  const [mostrarPolitica, setMostrarPolitica] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [podeSalvarLocal, setPodeSalvarLocal] = useState(false);
  const [duplicada, setDuplicada] = useState(null);
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    if (!isOpen || !backendAtivo) return undefined;
    const relogio = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(relogio);
  }, [isOpen]);

  // Esc fecha o modal.
  useEffect(() => {
    if (!isOpen) return undefined;
    anteriorRef.current = document.activeElement;
    requestAnimationFrame(() => dialogRef.current?.querySelector('input')?.focus());
    const aoTeclar = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const itens = [...dialogRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]')]
        .filter((el) => el.getClientRects().length > 0);
      if (!itens.length) return;
      if (e.shiftKey && document.activeElement === itens[0]) { e.preventDefault(); itens.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === itens.at(-1)) { e.preventDefault(); itens[0].focus(); }
    };
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      anteriorRef.current?.focus?.();
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (mostrarPolitica) requestAnimationFrame(() => dialogRef.current?.querySelector('#privacy-title')?.focus());
  }, [mostrarPolitica]);

  const [formData, setFormData] = useState({
    nome: '',
    address: '',
    bairro: '',
    day: backendAtivo ? diaAtualSaoPaulo() : 'Sexta-Feira',
    timeStart: '07:00',
    timeEnd: '13:00',
    ra: 'Outra'
  });

  if (!isOpen) return null;

  const horarioAgora = () => dentroDoHorarioDaFeira({
    day: formData.day, hours: `${formData.timeStart}–${formData.timeEnd}`,
  });
  const salvarPorHorario = backendAtivo && !dentroDoHorarioDaFeira({
    day: formData.day, hours: `${formData.timeStart}–${formData.timeEnd}`,
  }, agora);

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

  const salvarLocal = async ({ semGeocodificar = false } = {}) => {
    // If the user didn't use the map, try to geocode silently one last time
    let finalLat = pinLocation?.lat || null;
    let finalLng = pinLocation?.lng || null;

    if (!semGeocodificar && (!finalLat || !finalLng)) {
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
      nome: formData.nome,
      address: formData.address,
      bairro: formData.bairro,
      day: formData.day,
      hours: `${formData.timeStart}–${formData.timeEnd}`,
      ra: formData.ra,
      lat: finalLat,
      lng: finalLng,
      isCommunityAdded: true
    });

    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) confetti({
      particleCount: 150,
      spread: 90,
      origin: { y: 0.6 },
      colors: ['#5B7A3A', '#F28C28', '#C73A22']
    });

    handleClose();
  };

  const enviarComunidade = async () => {
    if (!horarioAgora()) { salvarLocal({ semGeocodificar: true }); return; }
    setIsGeocoding(true);
    setMensagem('');
    setPodeSalvarLocal(false);
    setDuplicada(null);
    let local;
    try { local = await localizacaoAtual(); }
    catch (erro) {
      setMensagem(erro.message);
      setIsGeocoding(false);
      return;
    }
    if (!horarioAgora()) {
      setIsGeocoding(false);
      salvarLocal({ semGeocodificar: true });
      return;
    }
    const res = await sugerirFeira({
      nome: formData.nome.trim(), endereco: formData.address.trim(), bairro: formData.bairro.trim(),
      dia: diaNumero(formData.day), inicio: formData.timeStart, fim: formData.timeEnd, local,
    });
    setIsGeocoding(false);
    if (res?.codigo === 'ok') {
      onEnviado?.();
      handleClose();
      return;
    }
    setMensagem(mensagemParaCodigo(res?.codigo, 'sugerir_feira'));
    setPodeSalvarLocal(res?.codigo === 'fora_do_horario' || res?.codigo === 'fora_do_raio');
    if (res?.codigo === 'duplicado') setDuplicada(encontrarDuplicada(markets.filter((m) => !m.isCommunityAdded && (m.coord_precisa || m.sugestao)), formData.day, local));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!backendAtivo) { salvarLocal(); return; }
    if (!horarioAgora()) { salvarLocal({ semGeocodificar: true }); return; }
    if (!privacidadeAceita()) { setMostrarPolitica(true); return; }
    enviarComunidade();
  };

  const handleClose = () => {
    setFormData({ nome: '', address: '', bairro: '', day: backendAtivo ? diaAtualSaoPaulo() : 'Sexta-Feira', timeStart: '07:00', timeEnd: '13:00', ra: 'Outra' });
    setPinLocation(null);
    setIsMapVisible(false);
    setMensagem('');
    setPodeSalvarLocal(false);
    setDuplicada(null);
    setMostrarPolitica(false);
    onClose();
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[rgba(47,30,18,0.42)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="bg-papel rounded-t-[20px] sm:rounded-[20px] shadow-[0_1px_3px_rgba(74,49,29,0.14)] w-full max-w-md overflow-hidden border-t sm:border border-linha animate-fade-in motion-reduce:animate-none max-h-[85dvh] flex flex-col">
        <div className="w-12 h-[5px] rounded-lg bg-[#CCBDA9] mx-auto mt-2.5 mb-4 shrink-0" aria-hidden="true" />

        <div className="flex justify-between items-start gap-2 px-4 mb-2 shrink-0">
          <div>
            <p className="text-xs font-extrabold tracking-[0.08em] uppercase text-verde m-0">Colabore com o mapa</p>
            <h2 id="modal-title" className="font-display text-[28px] leading-[1.05] font-extrabold text-tinta m-0">
              {backendAtivo ? 'Sugerir feira' : 'Sugerir uma feira'}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fechar formulário de sugestão"
            className="w-12 h-12 shrink-0 rounded-full border border-linha bg-creme hover:bg-papel text-tinta inline-flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-verde outline-none"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-6 flex-1">
          {mostrarPolitica ? <AvisoPrivacidade dentroDeDialogo
            acao="sugestão" temPendente mostrarAlca={false} onApagarDados={onApagarDados}
            onCancelar={() => { setMostrarPolitica(false); requestAnimationFrame(() => dialogRef.current?.querySelector('input')?.focus()); }}
            onConfirmar={() => { aceitarPrivacidade(); setMostrarPolitica(false); enviarComunidade(); }}
          /> : <>
          <p className="text-sm leading-[1.4] text-tinta-2 mt-0 mb-4">
            {backendAtivo
              ? 'Você precisa estar na feira, no dia e no horário dela. O ponto marcado é onde você está agora.'
              : 'Essa sugestão fica salva neste aparelho e nos ajuda a completar o guia.'}
          </p>

          <form id="add-market-form" onSubmit={handleSubmit} className="space-y-4">
            {backendAtivo && <div>
              <label htmlFor="market-name" className="block text-[13px] font-bold text-tinta mb-2">Nome</label>
              <input id="market-name" required maxLength={80} className={CAMPO} value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })} placeholder="Nome da feira" />
            </div>}
            <div>
              <label htmlFor="market-address" className="block text-[13px] font-bold text-tinta mb-2 cursor-pointer">Endereço</label>
              <input
                id="market-address"
                required
                maxLength={backendAtivo ? 80 : undefined}
                aria-required="true"
                type="text"
                className={CAMPO}
                placeholder="Rua e número aproximado"
                value={formData.address}
                onChange={e => {
                  setFormData({...formData, address: e.target.value});
                  setIsMapVisible(false);
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="market-bairro" className="block text-[13px] font-bold text-tinta mb-2 cursor-pointer">Bairro</label>
                <input
                  id="market-bairro"
                  required
                  maxLength={backendAtivo ? 80 : undefined}
                  aria-required="true"
                  type="text"
                  className={CAMPO}
                  placeholder="Ex.: Grajaú"
                  value={formData.bairro}
                  onChange={e => {
                    setFormData({...formData, bairro: e.target.value});
                    setIsMapVisible(false);
                  }}
                />
              </div>
              <div>
                <label htmlFor="market-day" className="block text-[13px] font-bold text-tinta mb-2 cursor-pointer">Dia da semana</label>
                <select
                  id="market-day"
                  className={CAMPO}
                  value={formData.day}
                  onChange={e => setFormData({...formData, day: e.target.value})}
                >
                  {DIAS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="time-start" className="block text-[13px] font-bold text-tinta mb-2 cursor-pointer">Início</label>
                <input
                  id="time-start"
                  required
                  aria-required="true"
                  type="time"
                  className={CAMPO}
                  value={formData.timeStart}
                  onChange={e => setFormData({...formData, timeStart: e.target.value})}
                />
              </div>
              <div>
                <label htmlFor="time-end" className="block text-[13px] font-bold text-tinta mb-2 cursor-pointer">Fim</label>
                <input
                  id="time-end"
                  required
                  aria-required="true"
                  type="time"
                  className={CAMPO}
                  value={formData.timeEnd}
                  onChange={e => setFormData({...formData, timeEnd: e.target.value})}
                />
              </div>
            </div>

            {salvarPorHorario && <p className="m-0 text-sm text-tinta-2" role="status">
              Para enviar à comunidade, a feira precisa estar acontecendo agora. Você ainda pode salvar só neste aparelho.
            </p>}

            {!backendAtivo && <div>
              {!isMapVisible ? (
                <button
                  type="button"
                  onClick={handleSearchLocation}
                  disabled={isGeocoding}
                  className="w-full h-12 flex items-center justify-center gap-2 bg-creme text-verde-escuro border border-linha hover:bg-verde-claro font-bold text-sm px-4 rounded-full transition-all focus-visible:ring-2 focus-visible:ring-verde outline-none disabled:opacity-50"
                >
                  <MapPin size={18} aria-hidden="true" />
                  {isGeocoding ? 'Buscando...' : 'Verificar e ajustar no mapa'}
                </button>
              ) : (
                <div className="border border-linha rounded-xl overflow-hidden flex flex-col">
                  <div className="bg-creme px-4 py-2 text-xs font-bold text-tinta flex justify-between items-center border-b border-linha">
                    <span>Arraste o pino para a posição exata</span>
                    <button type="button" onClick={() => setIsMapVisible(false)} aria-label="Esconder mapa" className="text-tinta-2 hover:text-tinta"><X size={14} aria-hidden="true" /></button>
                  </div>
                  <div className="h-48 w-full relative z-0">
                    <MapContainer
                      center={pinLocation ? [pinLocation.lat, pinLocation.lng] : [-22.9068, -43.1729]}
                      zoom={15}
                      scrollWheelZoom={true}
                      className="h-full w-full"
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">colaboradores do OpenStreetMap</a>'
                        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <ModalMapUpdater lat={pinLocation?.lat} lng={pinLocation?.lng} />
                      {pinLocation && (
                        <Marker
                          position={[pinLocation.lat, pinLocation.lng]}
                          icon={iconeEdicao}
                          draggable={true}
                          eventHandlers={{ dragend: handleDragEnd }}
                          ref={markerRef}
                        />
                      )}
                    </MapContainer>
                  </div>
                </div>
              )}
            </div>}

            {mensagem && <div role="alert" className="rounded-xl bg-creme p-4 text-sm text-tinta">
              <p className="m-0">{mensagem}</p>
              {duplicada && <button type="button" onClick={() => { handleClose(); onVerFeira?.(duplicada); }}
                className="mt-2 min-h-12 font-bold text-verde-escuro underline focus-visible:ring-2 focus-visible:ring-verde">
                Ver feira
              </button>}
            </div>}

            {podeSalvarLocal && !salvarPorHorario && <button type="button" onClick={salvarLocal}
              className="w-full min-h-12 rounded-full border-2 border-verde bg-papel px-4 text-sm font-extrabold text-verde-escuro focus-visible:ring-2 focus-visible:ring-verde">
              Salvar só neste aparelho
            </button>}

            <button
              type="submit"
              form="add-market-form"
              disabled={isGeocoding}
              className="w-full h-12 bg-verde hover:bg-verde-escuro text-papel text-[15px] font-extrabold px-4 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-verde outline-none disabled:opacity-70 disabled:cursor-wait"
            >
              {isGeocoding ? 'Enviando...' : salvarPorHorario ? 'Salvar só neste aparelho' : backendAtivo ? 'Enviar sugestão' : 'Salvar sugestão'}
            </button>

            {!backendAtivo && <p className="text-xs text-tinta-2 m-0 leading-4">
              Para achar o ponto no mapa, o endereço e o bairro são enviados ao OpenStreetMap (Nominatim). Não há cadastro e não pedimos nome nem e-mail.
            </p>}
          </form>
          </>}
        </div>

      </div>
    </div>
  );
}
