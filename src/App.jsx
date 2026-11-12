import { lazy, Suspense, useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { List, LocateFixed, Plus, Search } from 'lucide-react';
import Header from './components/Header';
import Hero from './components/Hero';
import FilterBar from './components/FilterBar';
import MarketList from './components/MarketList';
import FeiraSheet from './components/FeiraSheet';
import Fruta, { MarcaTomate } from './components/Frutas';
import { acontecendoAgora } from './utils/diaCor';
import { regiaoDaFeira } from './utils/regiao';
import AddMarketModal from './components/AddMarketModal';
import Aviso from './components/Aviso';
import ConfirmPrompt from './components/ConfirmPrompt';
import { useMarkets } from './hooks/useMarkets';
import {
  apagarMeusDados,
  backendAtivo,
  enviarConfirmacao,
  mensagemParaCodigo,
  sincronizarFilaConfirmacoes,
} from './api';
import { calculateDistance, sortMarketsByDistance } from './utils/distance';
import { appendCoordinates } from './utils/geocoding';
import {
  carregarConfirmacoes,
  diasDesde,
  feiraParaConfirmar,
  nomeDoDia,
  salvarConfirmacoes,
  ultimasConfirmacoesSim,
} from './utils/confirmacoes';

// Deslocamento mínimo (km) antes de atualizar a posição: evita reordenar a lista a cada tick do GPS.
const DESLOCAMENTO_MINIMO_KM = 0.025;

// O mapa (MapLibre GL) é pesado: só baixa quando alguém abre o mapa.
const MarketMap = lazy(() => import('./components/MarketMap'));

export default function App() {
  const { markets, isLoading, addMarket, confirmacoesPublicas, recarregarPublicos } = useMarkets();
  const [searchTerm, setSearchTerm] = useState('');
  // Começa em "Todos", para as sete cores aparecerem de cara
  const [selectedDay, setSelectedDay] = useState('Todos');
  const [viewMode, setViewMode] = useState('list');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const fecharModal = useCallback(() => setIsAddModalOpen(false), []);
  // Feira aberta na folha sobre a lista e pedido de foco para o mapa (vindo da folha).
  const [abertaId, setAbertaId] = useState(null);
  const [foco, setFoco] = useState(null);

  const [userLocation, setUserLocation] = useState(null);
  // A localização só é pedida depois de um toque em "Perto de mim" (ou se a permissão já foi dada).
  const [pedirLocal, setPedirLocal] = useState(false);
  const [erroLocal, setErroLocal] = useState('');
  const temGeo = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const isLocationPending = pedirLocal && !userLocation;

  const solicitarLocalizacao = useCallback(() => {
    if (!temGeo) return;
    setErroLocal('');
    setPedirLocal(true);
  }, [temGeo]);

  useEffect(() => {
    if (!temGeo || !navigator.permissions?.query) return;
    navigator.permissions.query({ name: 'geolocation' })
      .then((r) => { if (r.state === 'granted') setPedirLocal(true); })
      .catch(() => {});
  }, [temGeo]);

  // Acompanha a posição: a confirmação "Tem feira aqui agora?" depende de estar perto
  useEffect(() => {
    if (!pedirLocal || !temGeo) return undefined;

    const aoReceber = (position) => {
      setErroLocal('');
      const novo = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
      setUserLocation((anterior) => {
        if (anterior && calculateDistance(anterior.lat, anterior.lng, novo.lat, novo.lng) < DESLOCAMENTO_MINIMO_KM) {
          return anterior;
        }
        return novo;
      });
    };

    const aoFalhar = (error) => {
      console.warn("Geolocation blocked or failed:", error.message);
      setPedirLocal(false);
      setErroLocal('Localização negada. Busque pelo bairro ou tente de novo.');
    };

    const id = navigator.geolocation.watchPosition(aoReceber, aoFalhar, { maximumAge: 30000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [pedirLocal, temGeo]);

  // Relógio para o dia e o horário da confirmação (atualiza a cada minuto)
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  // Confirmações locais (só neste aparelho)
  const [confirmacoes, setConfirmacoes] = useState(carregarConfirmacoes);
  const [dispensadas, setDispensadas] = useState([]);
  const [aviso, setAviso] = useState('');
  const avisoTimerRef = useRef(null);

  const mostrarAviso = useCallback((texto) => {
    if (!texto) return;
    if (avisoTimerRef.current) {
      clearTimeout(avisoTimerRef.current);
    }
    setAviso(texto);
    avisoTimerRef.current = setTimeout(() => {
      setAviso('');
      avisoTimerRef.current = null;
    }, 4000);
  }, []);

  useEffect(() => () => {
    if (avisoTimerRef.current) {
      clearTimeout(avisoTimerRef.current);
    }
  }, []);

  const feiraAgora = useMemo(
    () => feiraParaConfirmar({
      feiras: markets.filter((m) => !backendAtivo || !m.sugestao),
      local: userLocation,
      agora,
      confirmacoes,
      ignorar: dispensadas,
    }),
    [markets, userLocation, agora, confirmacoes, dispensadas],
  );

  const diasConfirmadas = useMemo(() => {
    const locais = ultimasConfirmacoesSim(confirmacoes, agora);
    if (!backendAtivo || !confirmacoesPublicas) return locais;
    const combinado = { ...locais };
    for (const [id, info] of Object.entries(confirmacoesPublicas)) {
      if (!info?.ultimaConfirmacaoSim) continue;
      const dias = diasDesde(info.ultimaConfirmacaoSim, agora);
      if (dias === null || dias < 0 || dias > 28) continue;
      if (combinado[id] === undefined || dias < combinado[id]) {
        combinado[id] = dias;
      }
    }
    return combinado;
  }, [confirmacoes, confirmacoesPublicas, agora]);

  useEffect(() => {
    if (!backendAtivo) return undefined;
    const sincronizar = () => {
      sincronizarFilaConfirmacoes()
        .then(({ enviados, ultimoResultado }) => {
          if (enviados > 0) {
            if (ultimoResultado?.codigo && ultimoResultado.codigo !== 'ok') {
              mostrarAviso(mensagemParaCodigo(ultimoResultado.codigo));
            } else {
              recarregarPublicos();
            }
          }
        })
        .catch(() => {});
    };
    sincronizar();
    window.addEventListener('online', sincronizar);
    return () => window.removeEventListener('online', sincronizar);
  }, [recarregarPublicos, mostrarAviso]);

  const responderConfirmacao = (resposta) => {
    if (!feiraAgora) return;
    const alvo = feiraAgora;
    const entrada = { id: alvo.id, resposta, data: new Date().toISOString() };
    const proximo = [...confirmacoes, entrada];
    setConfirmacoes(proximo);
    salvarConfirmacoes(proximo);

    if (backendAtivo && userLocation && !alvo.isCommunityAdded) {
      enviarConfirmacao({
        feiraId: alvo.id,
        resposta,
        lat: userLocation.lat,
        lng: userLocation.lng,
        acuracia: userLocation.accuracy,
      })
        .then((res) => {
          if (res?.codigo === 'privacidade_pendente') {
            return;
          }
          if (res?.enfileirada) {
            mostrarAviso('Sem conexão. Sua resposta vai quando a internet voltar.');
          } else if (res?.codigo === 'ok') {
            recarregarPublicos();
          } else if (res?.codigo) {
            const msg = mensagemParaCodigo(res.codigo);
            console.warn(msg);
            mostrarAviso(msg);
          }
        })
        .catch(() => {
          mostrarAviso('Sem conexão. Sua resposta vai quando a internet voltar.');
        });
    }
  };

  const lidarApagarMeusDados = useCallback(() => {
    apagarMeusDados()
      .then((res) => {
        if (res?.codigo !== 'ok') return;
        setConfirmacoes([]);
        recarregarPublicos();
      })
      .catch(() => {});
  }, [recarregarPublicos]);

  const dispensarConfirmacao = () => {
    if (!feiraAgora) return;
    setDispensadas((atual) => [...atual, feiraAgora.id]);
  };

  // Update Document Title dynamically for accessibility
  useEffect(() => {
    const view = viewMode === 'list' ? 'Lista' : 'Mapa';
    const day = selectedDay === 'Todos' ? 'Todas as Feiras' : selectedDay;
    document.title = `Olha a Feira | ${view} - ${day}`;
  }, [viewMode, selectedDay]);

  // Process and Filter Markets
  const processedMarkets = useMemo(() => {
    // 1. Add coordinates
    let withCoords = appendCoordinates(markets.map((m) => backendAtivo && m.isCommunityAdded
      ? { ...m, pontoLocalSalvo: Number.isFinite(m.lat) && Number.isFinite(m.lng) }
      : m));

    // 2. Filter by search term
    if (searchTerm) {
      const normalize = (str) => str ? str.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() : '';
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
      withCoords = sortMarketsByDistance(withCoords, userLocation.lat, userLocation.lng).map(m => ({
        ...m,
        distance: calculateDistance(userLocation.lat, userLocation.lng, m.lat, m.lng),
      }));
    } else {
      // If no location, sort alphabetically by bairro
      withCoords = withCoords.sort((a, b) => a.bairro.localeCompare(b.bairro));
    }

    // Em "Todos" a ordem é só distância (ou bairro): subir as feiras de hoje deixaria as
    // primeiras páginas de uma cor só e esconderia as outras seis.
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
    const isLeftSwipe = distance > 100;
    const isRightSwipe = distance < -100;

    if (isLeftSwipe && viewMode === 'list') {
      setSelectedDay('Todos');
      setViewMode('map');
    }
    if (isRightSwipe && viewMode === 'map') {
      // Avoid conflict with system 'back' gesture (usually 0-20px)
      // but still allow an intentional swipe from the left-ish area
      if (touchStart > 30 && touchStart < 120) {
        setViewMode('list');
      }
    }
    setTouchStart(null);
    setTouchEnd(null);
  };

  // O mapa abre com todos os dias, para aparecerem todas as cores; a legenda filtra por dia.
  const abrirMapa = () => {
    setSelectedDay('Todos');
    setViewMode('map');
  };

  const hoje = nomeDoDia(agora);
  const mensagemVazia = searchTerm
    ? 'Tente outro bairro ou veja todos os dias.'
    : selectedDay === hoje
      ? 'Você pode tentar outro nome ou voltar a ver todas as feiras.'
      : 'Tente outro bairro ou veja todos os dias.';

  const modoMapa = viewMode === 'map';
  const feiraAberta = processedMarkets.find((m) => m.id === abertaId) ?? null;
  const fecharFolha = useCallback(() => setAbertaId(null), []);
  const sugestaoAtualizada = useCallback(() => {
    setConfirmacoes(carregarConfirmacoes());
    recarregarPublicos();
  }, [recarregarPublicos]);
  const sombraMapa = 'shadow-[0_2px_8px_rgba(59,42,32,0.12)]';

  return (
    <div id="topo" className={`flex flex-col bg-creme ${modoMapa ? 'h-[100dvh] overflow-hidden' : 'min-h-screen'}`}>
      {!modoMapa && <Header onAddClick={() => setIsAddModalOpen(true)} onMapClick={abrirMapa} />}

      <main
        className={`flex-1 flex flex-col relative min-h-0 ${modoMapa ? 'overflow-hidden' : 'overflow-x-hidden'}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          key={viewMode}
          className={`flex-1 flex flex-col w-full min-h-0 motion-reduce:animate-none ${modoMapa ? 'animate-slide-right' : 'animate-slide-left'}`}
        >
          {!modoMapa ? (
            <>
              {isLocationPending && (
                <div className="max-w-7xl mx-auto w-full px-4 pt-4">
                  <div
                    className="inline-flex items-center gap-2 bg-papel border border-linha py-2 px-4 rounded-full shadow-[0_1px_3px_rgba(74,49,29,0.08)]"
                    role="status"
                    aria-live="polite"
                  >
                    <LocateFixed size={16} className="text-verde animate-pulse shrink-0" aria-hidden="true" />
                    <p className="text-xs font-bold text-tinta m-0">
                      Buscando sua localização...
                    </p>
                  </div>
                </div>
              )}

              <Hero searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
              <FilterBar
                className="pt-4"
                selectedDay={selectedDay}
                setSelectedDay={setSelectedDay}
                agora={agora}
                onNear={temGeo && !userLocation && !isLocationPending ? solicitarLocalizacao : undefined}
              />

              {erroLocal && !userLocation && !isLocationPending && (
                <div className="max-w-7xl mx-auto w-full px-4 pt-2" role="alert">
                  <p className="text-xs font-bold text-tomate m-0">
                    {erroLocal}
                  </p>
                </div>
              )}

              <MarketList
                markets={processedMarkets}
                userLat={userLocation?.lat}
                userLon={userLocation?.lng}
                isLoading={isLoading}
                diasConfirmadas={diasConfirmadas}
                agora={agora}
                selectedDay={selectedDay}
                mensagemVazia={mensagemVazia}
                mostrarDia={selectedDay === 'Todos'}
                onAbrir={(m) => setAbertaId(m.id)}
                onLimpar={() => { setSearchTerm(''); setSelectedDay('Todos'); }}
              />
            </>
          ) : (
            <Suspense
              fallback={(
                <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-creme" role="status" aria-live="polite">
                  <Fruta nome="tomato" className="tomate-pula w-40 h-40" />
                  <p className="font-display text-2xl leading-8 font-extrabold text-tinta m-0">Abrindo o mapa...</p>
                </div>
              )}
            >
            <MarketMap
              foco={foco}
              onFocoAtendido={() => setFoco(null)}
              markets={processedMarkets}
              userLat={userLocation?.lat}
              userLon={userLocation?.lng}
              userAccuracy={userLocation?.accuracy}
              diasConfirmadas={diasConfirmadas}
              confirmacoesPublicas={confirmacoesPublicas}
              agora={agora}
              onPedirLocal={solicitarLocalizacao}
              onAviso={mostrarAviso}
              onVotoRegistrado={recarregarPublicos}
              onSugestaoAtualizada={sugestaoAtualizada}
              onTrechoProposto={recarregarPublicos}
              onApagarDados={backendAtivo ? lidarApagarMeusDados : undefined}
              topo={(
                <>
                  <div className="map-search-row flex gap-2 items-center px-4">
                    <label className="relative flex-1 block">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 flex text-tinta-2 pointer-events-none">
                        <Search size={18} aria-hidden="true" />
                      </span>
                      <input
                        type="search"
                        aria-label="Buscar feiras por bairro"
                        placeholder="Buscar por bairro"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={`block w-full h-12 pl-10 pr-3 rounded-full bg-papel text-tinta text-sm placeholder:text-tinta-2 border border-linha ${sombraMapa} focus-visible:ring-2 focus-visible:ring-verde focus:outline-none`}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setViewMode('list')}
                      aria-label="Ver lista de feiras"
                      className="w-12 h-12 shrink-0 rounded-full bg-verde text-papel border-0 shadow-[0_2px_8px_rgba(59,42,32,0.16)] flex items-center justify-center active:scale-95 focus-visible:ring-2 focus-visible:ring-manga focus-visible:ring-offset-2 outline-none"
                    >
                      <List size={20} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddModalOpen(true)}
                      aria-label={backendAtivo ? 'Sugerir feira' : 'Sugerir uma nova feira'}
                      className={`w-12 h-12 shrink-0 rounded-full bg-papel text-verde-escuro border-2 border-verde flex items-center justify-center ${sombraMapa} active:scale-95 focus-visible:ring-2 focus-visible:ring-verde focus-visible:ring-offset-2 outline-none`}
                    >
                      <Plus size={20} aria-hidden="true" />
                    </button>
                  </div>
                  {/* Legenda dos sete dias: cada chip é a cor do pino e filtra ao tocar */}
                  <FilterBar
                    noMapa
                    selectedDay={selectedDay}
                    setSelectedDay={setSelectedDay}
                    agora={agora}
                  />
                  {isLocationPending && (
                    <div className="px-4" role="status" aria-live="polite">
                      <div className="inline-flex items-center gap-2 bg-papel border border-linha py-1.5 px-3 rounded-full shadow-[0_1px_3px_rgba(74,49,29,0.08)]">
                        <LocateFixed size={14} className="text-verde animate-pulse shrink-0" aria-hidden="true" />
                        <span className="text-xs font-bold text-tinta">Buscando sua localização...</span>
                      </div>
                    </div>
                  )}
                  {erroLocal && !userLocation && !isLocationPending && (
                    <div className="px-4" role="alert">
                      <div className="inline-flex items-center bg-papel border border-linha py-1.5 px-3 rounded-full shadow-[0_1px_3px_rgba(74,49,29,0.08)]">
                        <span className="text-xs font-bold text-tomate">{erroLocal}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            />
            </Suspense>
          )}
        </div>
      </main>

      {/* Rodapé só na lista */}
      {!modoMapa && (
        <footer className="site-footer">
          <div className="footer-inner">
            <a className="footer-brand" href="#topo" aria-label="Olha a Feira, voltar ao topo">
              <MarcaTomate size={32} />
              <span>Olha a Feira</span>
            </a>
            <p className="footer-data">Dados da Prefeitura do Rio · olhafeira.tech</p>
            <p className="footer-credit">
              <span>Feito por</span>
              <a
                href="https://joao.quazz.com.br"
                target="_blank"
                rel="noopener noreferrer"
              >
                João Victor
              </a>
              <Fruta nome="orange" className="footer-fruit" />
            </p>
          </div>
        </footer>
      )}

      {feiraAberta && !modoMapa && (
        <FeiraSheet
          key={feiraAberta.id}
          market={feiraAberta}
          onFechar={fecharFolha}
          agora={acontecendoAgora(feiraAberta, agora)}
          agoraData={agora}
          diasConfirmada={diasConfirmadas[feiraAberta.id] ?? null}
          semFeiraHoje={Boolean(confirmacoesPublicas?.[feiraAberta.id]?.semFeiraHoje)}
          regiaoOrigem={regiaoDaFeira(feiraAberta)?.origem ?? null}
          userLat={userLocation?.lat}
          userLon={userLocation?.lng}
          userAccuracy={userLocation?.accuracy}
          podeRota={Boolean(userLocation)}
          onAviso={mostrarAviso}
          onVotoRegistrado={recarregarPublicos}
          onSugestaoAtualizada={sugestaoAtualizada}
          onPedirLocal={solicitarLocalizacao}
          onCorrigirTrecho={(market) => {
            setFoco({ id: market.id, desenhar: true });
            setAbertaId(null);
            setViewMode('map');
          }}
          onApagarDados={backendAtivo ? lidarApagarMeusDados : undefined}
          onVerRota={() => {
            // A rota é desenhada no mapa: leva a feira para lá.
            setFoco({ id: feiraAberta.id, rota: true });
            setAbertaId(null);
            setViewMode('map');
          }}
        />
      )}

      <AddMarketModal
          key={backendAtivo ? String(isAddModalOpen) : undefined}
        isOpen={isAddModalOpen}
        onClose={fecharModal}
        onAdd={addMarket}
        onEnviado={() => {
          mostrarAviso(mensagemParaCodigo('ok', 'sugerir_feira'));
          recarregarPublicos();
        }}
        onApagarDados={backendAtivo ? lidarApagarMeusDados : undefined}
        markets={processedMarkets}
        onVerFeira={(feira) => {
          if (modoMapa) setFoco({ id: feira.id });
          else setAbertaId(feira.id);
        }}
      />

      {feiraAgora && (
        <ConfirmPrompt
          key={feiraAgora.id}
          feira={feiraAgora}
          onAnswer={responderConfirmacao}
          onDismiss={dispensarConfirmacao}
          onApagarDados={backendAtivo ? lidarApagarMeusDados : undefined}
        />
      )}

      {backendAtivo && <Aviso mensagem={aviso} />}
    </div>
  );
}
