import { useCallback, useEffect, useRef, useState } from 'react';
import * as maplibregl from "maplibre-gl";
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

maplibregl.setWorkerUrl(maplibreWorkerUrl);
import { LocateFixed, TriangleAlert } from 'lucide-react';
import FeiraCartao from './FeiraCartao';
import AvisoPrivacidade from './AvisoPrivacidade';
import { aceitarPrivacidade, backendAtivo, CODIGO_PRIVACIDADE_PENDENTE, mensagemParaCodigo, MENSAGEM_SEM_CONEXAO_TRECHO, privacidadeAceita, proporTrecho, salvarPropostaMinha } from '../api';
import { TRECHOS_INFO } from '../data/trechosInfo';
import { nomeDoDia } from '../utils/confirmacoes';
import { acontecendoAgora, diaCor } from '../utils/diaCor';
import { centroDoTrecho } from '../utils/geocoding';
import { pinoClusterElemento, pinoFeiraElemento, pinoNumeradoElemento, pinoUsuarioElemento } from '../utils/mapPinos';
import { pontosDaRegiao, regiaoDaFeira } from '../utils/regiao';
import { modoSugerido } from '../utils/rotas';
import { analisarTrechoDesenhado } from '../utils/trechoDesenho';

// Mapa vetorial gratuito e sem chave: OpenFreeMap, estilo "positron" (claro e minimalista).
const ESTILO = 'https://tiles.openfreemap.org/styles/positron';
const CENTRO_RIO = [-43.2096, -22.9035]; // [lng, lat] centro do Rio de Janeiro
const PAPEL = '#FFFDF8';
const COR_VERDE = '#5B7A3A';
const COR_MEARIM = '#C73A22';
// A partir deste zoom, a região de todas as feiras visíveis no filtro é desenhada.
const ZOOM_REGIOES = 14;

const lngLat = ([lat, lng]) => [lng, lat];

function pontoDaFeira(market) {
  if (!market) return null;
  const centro = centroDoTrecho(market.trecho);
  if (centro) return centro;
  if (Number.isFinite(market.lat) && Number.isFinite(market.lng)) {
    return { lat: market.lat, lng: market.lng };
  }
  return null;
}

function temTrechoManual(market) {
  return Boolean(market && regiaoDaFeira(market)?.origem === 'manual');
}

function ehTrechoCuradoMearim(market) {
  return Boolean(
    market &&
    String(market.id) === '49' &&
    TRECHOS_INFO[market.id] &&
    temTrechoManual(market) &&
    (!backendAtivo || !market.trechoOrigem || market.trechoOrigem === 'curado'),
  );
}

function pontosDaPropostaAberta(market) {
  if (!backendAtivo || !market?.trechoEmVotacao) return null;
  const pts = Array.isArray(market.trechoEmVotacao)
    ? market.trechoEmVotacao
    : market.trechoEmVotacao.pontos;
  return Array.isArray(pts) && pts.length >= 2 ? pts : null;
}

function caixaDasFeiras(markets) {
  const b = new maplibregl.LngLatBounds();
  markets.forEach((market) => {
    const p = pontoDaFeira(market);
    if (p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
      b.extend([p.lng, p.lat]);
    }
  });
  return b.isEmpty() ? null : b;
}

const VAZIO = { type: 'FeatureCollection', features: [] };

// Círculo de raio fixo (metros) como polígono, para mercados sem contorno no OSM.
function circulo([lat, lng], raio = 40, passos = 32) {
  const dLat = raio / 111320;
  const dLng = raio / (111320 * Math.cos((lat * Math.PI) / 180));
  const anel = [];
  for (let i = 0; i <= passos; i += 1) {
    const a = (i / passos) * 2 * Math.PI;
    anel.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return anel;
}

// Corredor da rua em metros convertido em pixels por zoom (24 m ≈ 12 m de cada lado em Mearim).
// Piso de 16 px no contorno e 10 px na faixa nos zooms baixos para a faixa nunca virar um fio.
const LARGURA_CONTORNO_TRECHO = ['interpolate', ['linear'], ['zoom'], 12, 16, 15, 22, 16, 26, 17, 32, 18, 48, 20, 120];
const LARGURA_FAIXA_TRECHO = ['interpolate', ['linear'], ['zoom'], 12, 10, 15, 14, 16, 18, 17, 22, 18, 36, 20, 108];
// Proposta em votação: cerca de 60% da largura do vigente, com contorno papel por baixo.
const LARGURA_CONTORNO_PROPOSTA = ['interpolate', ['linear'], ['zoom'], 12, 10, 15, 14, 16, 16, 17, 20, 18, 30, 20, 72];
const LARGURA_FAIXA_PROPOSTA = ['interpolate', ['linear'], ['zoom'], 12, 6, 15, 8, 16, 11, 17, 13, 18, 22, 20, 65];

// Repinta de leve a água e os parques do positron. Cada camada só é tocada se existir.
function ajustarEstilo(map) {
  const pintar = (id, prop, valor) => {
    if (map.getLayer(id)) map.setPaintProperty(id, prop, valor);
  };
  pintar('water', 'fill-color', '#DCEEF2');
  pintar('park', 'fill-color', '#E3E9DD');
}

function adicionarCamadas(map) {
  // Faixas e áreas ficam abaixo dos rótulos do mapa, para o texto continuar legível.
  const primeiroRotulo = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  const antes = (layer) => map.addLayer(layer, primeiroRotulo);

  map.addSource('regioes', { type: 'geojson', data: VAZIO });
  map.addSource('rota', { type: 'geojson', data: VAZIO });
  map.addSource('desenho-trecho', { type: 'geojson', data: VAZIO });
  map.addSource('feiras', {
    type: 'geojson',
    data: VAZIO,
    cluster: true,
    clusterRadius: 48,
    clusterMaxZoom: 14,
  });

  const linhaOsm = ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'manual'], false], ['!=', ['get', 'proposta'], true]];
  const linhaManual = ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'manual'], true], ['!=', ['get', 'proposta'], true]];
  const linhaProposta = ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'proposta'], true]];
  const arredondada = { 'line-cap': 'round', 'line-join': 'round' };

  // Mercado: preenchimento 20% e borda na cor do dia.
  antes({ id: 'regioes-area', type: 'fill', source: 'regioes', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': ['get', 'cor'], 'fill-opacity': 0.2 } });
  antes({ id: 'regioes-area-borda', type: 'line', source: 'regioes', filter: ['==', ['geometry-type'], 'Polygon'], layout: arredondada, paint: { 'line-color': ['get', 'cor'], 'line-width': 3, 'line-opacity': 0.9 } });

  // Faixa larga: contorno papel de 4 px por baixo (8 px a mais no total) e cor forte do dia por cima.
  antes({ id: 'regioes-contorno', type: 'line', source: 'regioes', filter: linhaOsm, layout: arredondada, paint: { 'line-color': PAPEL, 'line-width': ['case', ['get', 'destaque'], 20, 18], 'line-opacity': ['case', ['get', 'desenho'], 0.4, 1] } });
  antes({ id: 'regioes-faixa', type: 'line', source: 'regioes', filter: linhaOsm, layout: arredondada, paint: { 'line-color': ['get', 'cor'], 'line-width': ['case', ['get', 'destaque'], 12, 10], 'line-opacity': ['case', ['get', 'desenho'], 0.4, ['get', 'destaque'], 1, 0.9] } });

  // Trecho vigente (curado da Mearim com COR_MEARIM ou comunidade com cor do dia): faixa com contorno papel.
  antes({ id: 'trecho-contorno', type: 'line', source: 'regioes', minzoom: ZOOM_REGIOES, filter: linhaManual, layout: arredondada, paint: { 'line-color': PAPEL, 'line-width': LARGURA_CONTORNO_TRECHO, 'line-gap-width': 0, 'line-opacity': ['case', ['get', 'desenho'], 0.4, 1] } });
  antes({ id: 'trecho-faixa', type: 'line', source: 'regioes', minzoom: ZOOM_REGIOES, filter: linhaManual, layout: arredondada, paint: { 'line-color': ['get', 'cor'], 'line-width': LARGURA_FAIXA_TRECHO, 'line-opacity': ['case', ['get', 'desenho'], 0.4, 1] } });

  // Proposta aberta em votação: mais estreita (~60% do vigente), contorno papel por baixo, tracejada, na mesma cor.
  antes({ id: 'trecho-proposta-contorno', type: 'line', source: 'regioes', minzoom: ZOOM_REGIOES, filter: linhaProposta, layout: arredondada, paint: { 'line-color': PAPEL, 'line-width': LARGURA_CONTORNO_PROPOSTA, 'line-gap-width': 0 } });
  antes({ id: 'trecho-proposta-faixa', type: 'line', source: 'regioes', minzoom: ZOOM_REGIOES, filter: linhaProposta, layout: arredondada, paint: { 'line-color': ['get', 'cor'], 'line-width': LARGURA_FAIXA_PROPOSTA, 'line-dasharray': [2, 1.5] } });

  map.addLayer({ id: 'rota-linha', type: 'line', source: 'rota', layout: arredondada, paint: { 'line-color': COR_VERDE, 'line-width': 6, 'line-opacity': 0.8, 'line-dasharray': [1.5, 1.5] } });
  map.addLayer({ id: 'desenho-contorno', type: 'line', source: 'desenho-trecho', layout: arredondada, paint: { 'line-color': PAPEL, 'line-width': 9 } });
  map.addLayer({ id: 'desenho-linha', type: 'line', source: 'desenho-trecho', layout: arredondada, paint: { 'line-color': ['get', 'cor'], 'line-width': 5 } });
  map.addLayer({ id: 'feiras-pontos', type: 'circle', source: 'feiras', paint: { 'circle-radius': 0, 'circle-opacity': 0 } });
}

export default function MarketMap({
  markets,
  userLat,
  userLon,
  userAccuracy,
  onPedirLocal,
  diasConfirmadas = {},
  confirmacoesPublicas = {},
  agora = new Date(),
  topo = null,
  foco = null,
  onFocoAtendido,
  onAviso,
  onVotoRegistrado,
  onTrechoProposto,
  onSugestaoAtualizada,
  onApagarDados,
}) {
  const posicaoUsuario = userLat && userLon ? [userLat, userLon] : null;
  const hoje = nomeDoDia(agora);

  const [activeRoute, setActiveRoute] = useState(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [selecionadaId, setSelecionadaId] = useState(null);
  const [zoomAlto, setZoomAlto] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [erroMapa, setErroMapa] = useState(false);
  const [desenho, setDesenho] = useState(null);
  const [enviandoTrecho, setEnviandoTrecho] = useState(false);

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const marcadoresRef = useRef(new Map()); // id -> { marker, assinatura }
  const clustersRef = useRef(new Map()); // clusterId -> { marker, assinatura }
  const trechoMarcadoresRef = useRef([]);
  const usuarioMarkerRef = useRef(null);
  const cartaoRef = useRef(null);
  const corrigirRef = useRef(null);
  const tituloCartaoRef = useRef(null);
  const motivoTituloRef = useRef(null);
  const barraRef = useRef(null);
  const marcadoresDesenhoRef = useRef([]);
  const desenhoEtapaRef = useRef(null);
  const restaurarFocoRef = useRef(false);
  const focarTituloRef = useRef(false);
  const cameraAntesDesenhoRef = useRef(null);
  const enquadrouDesenhoRef = useRef(false);
  const centralizadoRef = useRef(false);
  const fechar = useCallback(() => {
    const id = selecionadaId;
    setSelecionadaId(null);
    setActiveRoute(null);
    requestAnimationFrame(() => requestAnimationFrame(() => marcadoresRef.current.get(id)?.marker.getElement().focus()));
  }, [selecionadaId]);

  // A feira selecionada some do cartão se o filtro a tirar da lista.
  const selecionada = markets.find((m) => m.id === selecionadaId) ?? null;
  useEffect(() => {
    if (selecionadaId) requestAnimationFrame(() => tituloCartaoRef.current?.focus());
  }, [selecionadaId]);
  const regiaoSel = selecionada ? regiaoDaFeira(selecionada) : null;
  const analiseDesenho = desenho && selecionada
    ? analisarTrechoDesenhado(desenho.pontos, selecionada)
    : null;
  const etapaDesenho = desenho?.etapa ?? null;
  const desenhoAtivo = Boolean(desenho);

  useEffect(() => {
    desenhoEtapaRef.current = etapaDesenho;
  }, [etapaDesenho]);

  useEffect(() => {
    if (etapaDesenho === 'desenho') barraRef.current?.focus();
    if (etapaDesenho === 'motivo') motivoTituloRef.current?.focus();
    if (!etapaDesenho && restaurarFocoRef.current) {
      restaurarFocoRef.current = false;
      requestAnimationFrame(() => corrigirRef.current?.focus());
    }
    if (!etapaDesenho && focarTituloRef.current) {
      focarTituloRef.current = false;
      requestAnimationFrame(() => tituloCartaoRef.current?.focus());
    }
  }, [etapaDesenho]);

  const iniciarDesenho = useCallback((market) => {
    if (!backendAtivo || !market?.coord_precisa || market.trechoEmVotacao) return;
    const map = mapRef.current;
    if (map) {
      cameraAntesDesenhoRef.current = {
        center: map.getCenter(),
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
        padding: map.getPadding(),
      };
    }
    enquadrouDesenhoRef.current = false;
    desenhoEtapaRef.current = 'desenho';
    setSelecionadaId(market.id);
    setActiveRoute(null);
    setDesenho({ etapa: 'desenho', pontos: [], motivo: null });
  }, []);

  const cancelarDesenho = () => {
    desenhoEtapaRef.current = null;
    restaurarFocoRef.current = true;
    setDesenho(null);
  };

  // Cria o mapa uma vez.
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: ESTILO,
      center: CENTRO_RIO,
      zoom: 11,
      attributionControl: false, // a atribuição fica numa barra fixa abaixo do mapa
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    if (!posicaoUsuario) {
      const b = caixaDasFeiras(markets);
      if (b) {
        map.fitBounds(b, {
          padding: { top: 136, bottom: 96, left: 24, right: 24 },
          maxZoom: 13,
          duration: 0,
        });
      }
    }

    const atualizarZoom = () => setZoomAlto(map.getZoom() >= ZOOM_REGIOES);
    map.on('load', () => {
      ajustarEstilo(map);
      adicionarCamadas(map);
      atualizarZoom();
      setPronto(true);
    });
    map.on('zoom', atualizarZoom);
    map.on('moveend', atualizarZoom);
    map.on('click', (e) => {
      if (desenhoEtapaRef.current) {
        if (desenhoEtapaRef.current === 'desenho') {
          const ponto = [Number(e.lngLat.lat.toFixed(6)), Number(e.lngLat.lng.toFixed(6))];
          setDesenho((atual) => atual?.etapa === 'desenho'
            ? { ...atual, pontos: [...atual.pontos, ponto] }
            : atual);
        }
      } else {
        fechar();
      }
    });
    map.on('error', (e) => {
      // Falha ao carregar o estilo (sem rede, por exemplo): avisa; erros de um tile solto não derrubam o mapa.
      if (!map.isStyleLoaded() && !map.getStyle()?.layers?.length) setErroMapa(true);
      console.warn('Mapa:', e?.error?.message ?? e);
    });

    const marcadores = marcadoresRef.current;
    const clusters = clustersRef.current;
    return () => {
      marcadores.clear();
      clusters.clear();
      trechoMarcadoresRef.current = [];
      marcadoresDesenhoRef.current.forEach((marker) => marker.remove());
      marcadoresDesenhoRef.current = [];
      usuarioMarkerRef.current = null;
      mapRef.current = null;
      map.remove();
    };
    // Enquadramento inicial usa as feiras e a posição presentes na montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechar]);

  // Enquadra uma região (ou só o pino) deixando espaço para a busca em cima e o cartão embaixo.
  const enquadrar = useCallback((market, duration = 600) => {
    const map = mapRef.current;
    if (!map) return;
    const regiao = regiaoDaFeira(market);
    const ponto = pontoDaFeira(market);
    const altura = containerRef.current?.clientHeight ?? 800;
    // Altura real do cartão (já renderizado) + margem de baixo e respiro; senão, estimativa.
    const cartao = cartaoRef.current?.offsetHeight;
    const desejarBottom = cartao ? cartao + 24 : Math.min(540, Math.round(altura * 0.6));
    const bottom = Math.min(desejarBottom, Math.max(240, altura - 144 - 80));
    const top = Math.min(regiao?.origem === 'manual' ? 144 + 48 : 144, Math.max(144, altura - bottom - 80));
    const lateral = regiao?.origem === 'manual' ? 56 : 48;
    const padding = { top, bottom, left: lateral, right: lateral };
    if (regiao) {
      const b = new maplibregl.LngLatBounds();
      pontosDaRegiao(regiao, market).forEach((p) => b.extend(lngLat(p)));
      map.fitBounds(b, { padding, maxZoom: 17, duration });
    } else if (ponto) {
      map.easeTo({ center: [ponto.lng, ponto.lat], zoom: Math.max(map.getZoom(), 15), padding, duration });
    }
  }, []);

  const selecionar = useCallback((market) => {
    if (desenhoEtapaRef.current) return;
    setActiveRoute(null);
    setSelecionadaId(market.id);
    // Espera o cartão renderizar para enquadrar com a altura real dele.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!desenhoEtapaRef.current) enquadrar(market);
    }));
  }, [enquadrar]);

  const handleFetchRoute = useCallback(async (market) => {
    const ponto = pontoDaFeira(market);
    if (!userLat || !userLon || !ponto) return;
    const modo = modoSugerido(market.distance);
    setIsLoadingRoute(true);
    try {
      // OSRM usa longitude,latitude
      const url = `https://router.project-osrm.org/route/v1/${modo}/${userLon},${userLat};${ponto.lng},${ponto.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        setActiveRoute(data.routes[0].geometry.coordinates);
      }
    } catch (err) {
      console.error('Failed to fetch route', err);
      alert('Não foi possível carregar a rota no momento.');
    } finally {
      setIsLoadingRoute(false);
    }
  }, [userLat, userLon]);

  // Abre a feira pedida de fora (toque no card da lista): seleciona e, se pedido, traça a rota.
  useEffect(() => {
    if (!foco || !pronto) return;
    const market = markets.find((m) => m.id === foco.id);
    if (market) {
      selecionar(market);
      if (foco.desenhar) requestAnimationFrame(() => iniciarDesenho(market));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (foco.rota) handleFetchRoute(market);
    }
    onFocoAtendido?.();
    // Só reage a um novo pedido de foco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foco, pronto]);

  // O enquadramento reserva espaço para a barra e mantém o trecho visível acima dela.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pronto) return;
    if (desenho) {
      const bottom = Math.max(barraRef.current?.offsetHeight ?? 0, 192) + 40;
      const padding = { top: 144, bottom, left: 32, right: 32 };
      if (desenho.etapa === 'desenho' && selecionada && !enquadrouDesenhoRef.current) {
        const regiao = regiaoDaFeira(selecionada);
        const ponto = pontoDaFeira(selecionada);
        const pts = regiao ? pontosDaRegiao(regiao, selecionada) : ponto ? [[ponto.lat, ponto.lng]] : [];
        const bounds = new maplibregl.LngLatBounds();
        pts.forEach((p) => bounds.extend(lngLat(p)));
        if (!bounds.isEmpty()) {
          const camera = map.cameraForBounds(bounds, { padding, maxZoom: 18 });
          if (camera) {
            map.jumpTo({ ...camera, zoom: Math.max(17, camera.zoom), padding });
            enquadrouDesenhoRef.current = true;
          }
        }
      }
    } else if (cameraAntesDesenhoRef.current) {
      map.jumpTo(cameraAntesDesenhoRef.current);
      cameraAntesDesenhoRef.current = null;
      enquadrouDesenhoRef.current = false;
    }
    // Somente a troca de etapa altera o enquadramento, não cada ponto desenhado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desenho?.etapa, selecionadaId, pronto]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pronto) return undefined;
    const fonte = map.getSource('desenho-trecho');
    const pontos = desenho?.pontos ?? [];
    if (fonte) fonte.setData(pontos.length >= 2 ? {
      type: 'Feature',
      properties: { cor: diaCor(selecionada?.day).forte },
      geometry: { type: 'LineString', coordinates: pontos.map(lngLat) },
    } : VAZIO);
    marcadoresDesenhoRef.current.forEach((marker) => marker.remove());
    marcadoresDesenhoRef.current = pontos.map((ponto, i) => {
      const el = document.createElement('div');
      el.className = 'w-6 h-6 rounded-full border-2 border-papel text-xs font-extrabold flex items-center justify-center shadow-md pointer-events-none';
      el.style.backgroundColor = diaCor(selecionada?.day).forte;
      el.style.color = diaCor(selecionada?.day).sobreForte;
      el.setAttribute('aria-hidden', 'true');
      el.textContent = String(i + 1);
      return new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(lngLat(ponto)).addTo(map);
    });
    return () => {
      marcadoresDesenhoRef.current.forEach((marker) => marker.remove());
      marcadoresDesenhoRef.current = [];
    };
  }, [desenho?.pontos, selecionada, pronto]);

  // Rota: desenha e enquadra quando muda.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pronto) return;
    const fonte = map.getSource('rota');
    if (!fonte) return;
    if (activeRoute && activeRoute.length > 0) {
      fonte.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: activeRoute }, properties: {} });
      const b = new maplibregl.LngLatBounds();
      activeRoute.forEach((c) => b.extend(c));
      map.fitBounds(b, { padding: { top: 144, bottom: 540, left: 48, right: 48 }, duration: 600 });
    } else {
      fonte.setData(VAZIO);
    }
  }, [activeRoute, pronto]);

  // Regiões: as do OSM, o trecho vigente e eventual proposta aberta no zoom >= ZOOM_REGIOES ou quando selecionada.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pronto) return;
    const fonte = map.getSource('regioes');
    if (!fonte) return;
    const selecionadaComTrecho = markets.some(
      (m) => m.id === selecionadaId && (temTrechoManual(m) || Boolean(pontosDaPropostaAberta(m))),
    );
    const minZoomTrecho = selecionadaComTrecho ? 0 : ZOOM_REGIOES;
    if (map.getLayer('trecho-contorno')) map.setLayerZoomRange('trecho-contorno', minZoomTrecho, 24);
    if (map.getLayer('trecho-faixa')) map.setLayerZoomRange('trecho-faixa', minZoomTrecho, 24);
    if (map.getLayer('trecho-proposta-contorno')) map.setLayerZoomRange('trecho-proposta-contorno', minZoomTrecho, 24);
    if (map.getLayer('trecho-proposta-faixa')) map.setLayerZoomRange('trecho-proposta-faixa', minZoomTrecho, 24);
    const itens = markets
      .map((m) => ({ market: m, regiao: regiaoDaFeira(m), proposta: pontosDaPropostaAberta(m) }))
      .filter((r) => r.regiao || r.proposta)
      .filter((r) => desenhoAtivo ? r.market.id === selecionadaId : r.market.id === selecionadaId || zoomAlto);
    // A selecionada vai por último, para ficar por cima das outras.
    itens.sort((a, b) => Number(a.market.id === selecionadaId) - Number(b.market.id === selecionadaId));
    const features = [];
    itens.forEach(({ market, regiao, proposta }) => {
      if (regiao) {
        const ehManual = regiao.origem === 'manual';
        const cor = ehTrechoCuradoMearim(market) ? COR_MEARIM : diaCor(market.day).forte;
        const props = { cor, destaque: market.id === selecionadaId, manual: ehManual, proposta: false, desenho: desenhoAtivo };
        if (regiao.poligono && !desenhoAtivo) {
          features.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [regiao.poligono.map(lngLat)] } });
        } else if (regiao.ponto && !desenhoAtivo) {
          features.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [circulo(regiao.ponto)] } });
        }
        regiao.linhas.forEach((linha) => {
          features.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: linha.map(lngLat) } });
        });
      }
      if (proposta && !desenhoAtivo) {
        features.push({
          type: 'Feature',
          properties: {
            cor: ehTrechoCuradoMearim(market) ? COR_MEARIM : diaCor(market.day).forte,
            destaque: market.id === selecionadaId,
            manual: true,
            proposta: true,
          },
          geometry: {
            type: 'LineString',
            coordinates: proposta.map(lngLat),
          },
        });
      }
    });
    fonte.setData({ type: 'FeatureCollection', features });
  }, [markets, selecionadaId, zoomAlto, pronto, desenhoAtivo]);

  // Fonte agrupada (cluster) das feiras: exclui a selecionada e, no zoom >= ZOOM_REGIOES, o trecho curado da Mearim.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pronto) return;
    const fonte = map.getSource('feiras');
    if (!fonte) return;
    const features = [];
    if (desenhoAtivo) {
      fonte.setData(VAZIO);
      return;
    }
    markets.forEach((market) => {
      const ponto = pontoDaFeira(market);
      if (!ponto) return;
      if (market.id === selecionadaId) return;
      if (ehTrechoCuradoMearim(market) && zoomAlto) return;
      features.push({
        type: 'Feature',
        properties: { id: String(market.id) },
        geometry: { type: 'Point', coordinates: [ponto.lng, ponto.lat] },
      });
    });
    fonte.setData({ type: 'FeatureCollection', features });
  }, [markets, selecionadaId, zoomAlto, pronto, desenhoAtivo]);

  const expandirCluster = useCallback(async (clusterId, coords) => {
    const map = mapRef.current;
    const fonte = map?.getSource('feiras');
    if (!map || !fonte) return;
    try {
      const zoom = await fonte.getClusterExpansionZoom(clusterId);
      map.easeTo({ center: coords, zoom, duration: 240 });
    } catch {
      // Cluster já mudou na fonte.
    }
  }, []);

  // Pinos das feiras e círculos de cluster. Atualiza ao mover/carregar fonte lendo querySourceFeatures.
  const sincronizarPinos = useCallback(() => {
    const map = mapRef.current;
    if (!map || !pronto || !map.getSource('feiras')) return;
    if (desenhoAtivo) {
      marcadoresRef.current.forEach(({ marker }) => marker.remove());
      marcadoresRef.current.clear();
      clustersRef.current.forEach(({ marker }) => marker.remove());
      clustersRef.current.clear();
      return;
    }

    const trechoAtivo = (market) => ehTrechoCuradoMearim(market) && (zoomAlto || market.id === selecionadaId);
    const temFeirasNoFonte = markets.some(
      (market) => Boolean(pontoDaFeira(market)) && market.id !== selecionadaId && !trechoAtivo(market),
    );
    const carregada = !temFeirasNoFonte || map.isSourceLoaded('feiras');
    const features = carregada && temFeirasNoFonte ? map.querySourceFeatures('feiras') : [];

    const clustersExistentes = clustersRef.current;
    const feirasVisiveis = new Set();

    if (carregada) {
      const clustersVistos = new Map();
      features.forEach((f) => {
        if (f.properties?.cluster) {
          const cid = f.properties.cluster_id;
          if (!clustersVistos.has(cid)) {
            clustersVistos.set(cid, {
              id: cid,
              quantidade: f.properties.point_count,
              coords: f.geometry.coordinates,
            });
          }
        } else if (f.properties?.id !== undefined) {
          feirasVisiveis.add(String(f.properties.id));
        }
      });

      clustersVistos.forEach((info, cid) => {
        const assinatura = `${info.quantidade}|${info.coords[0].toFixed(5)}|${info.coords[1].toFixed(5)}`;
        const atual = clustersExistentes.get(cid);
        if (atual && atual.assinatura === assinatura) return;
        const el = pinoClusterElemento({
          quantidade: info.quantidade,
          onClick: () => expandirCluster(cid, info.coords),
        });
        if (atual) atual.marker.remove();
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(info.coords).addTo(map);
        clustersExistentes.set(cid, { marker, assinatura });
      });

      clustersExistentes.forEach((v, cid) => {
        if (!clustersVistos.has(cid)) {
          v.marker.remove();
          clustersExistentes.delete(cid);
        }
      });
    }

    const existentes = marcadoresRef.current;
    const presentes = new Set();
    let novos = 0;

    markets.forEach((market) => {
      const ponto = pontoDaFeira(market);
      if (!ponto) return;
      // No zoom >= ZOOM_REGIOES (ou quando selecionada), a feira com trecho manual (Mearim) é representada pelos 3 pinos numerados.
      if (trechoAtivo(market)) return;
      const selecionadaAqui = market.id === selecionadaId;
      const visivel = selecionadaAqui || (carregada ? feirasVisiveis.has(String(market.id)) : existentes.has(market.id));
      if (!visivel) return;
      presentes.add(market.id);

      const confirmada = diasConfirmadas[market.id] !== undefined;
      const agoraAqui = acontecendoAgora(market, agora);
      const ehHoje = market.day === hoje;
      const assinatura = [market.day, market.sugestao, confirmada, selecionadaAqui, agoraAqui, ehHoje, ponto.lat, ponto.lng].join('|');
      const atual = existentes.get(market.id);
      if (atual && atual.assinatura === assinatura) return;

      // Queda escalonada: cada pino 240 ms, o último começa até 480 ms depois (total <= 720 ms).
      const atraso = !atual && !selecionadaAqui ? Math.min(novos * 8, 480) : null;
      if (!atual && !selecionadaAqui) novos += 1;
      const el = pinoFeiraElemento({
        market,
        confirmada: !market.sugestao && confirmada,
        selecionada: selecionadaAqui,
        agora: !market.sugestao && agoraAqui,
        ehHoje,
        atraso,
        onClick: () => selecionar(market),
      });
      if (atual) atual.marker.remove();
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([ponto.lng, ponto.lat]).addTo(map);
      existentes.set(market.id, { marker, assinatura });
    });

    existentes.forEach((v, id) => {
      if (!presentes.has(id)) {
        v.marker.remove();
        existentes.delete(id);
      }
    });
  }, [markets, diasConfirmadas, agora, hoje, selecionadaId, zoomAlto, pronto, selecionar, expandirCluster, desenhoAtivo]);

  useEffect(() => {
    sincronizarPinos();
  }, [sincronizarPinos]);

  useEffect(() => {
    const pointerEvents = desenhoAtivo ? 'none' : '';
    marcadoresRef.current.forEach(({ marker }) => { marker.getElement().style.pointerEvents = pointerEvents; });
    clustersRef.current.forEach(({ marker }) => { marker.getElement().style.pointerEvents = pointerEvents; });
    trechoMarcadoresRef.current.forEach(({ el }) => { el.style.pointerEvents = pointerEvents; });
  }, [desenhoAtivo, markets, selecionadaId, zoomAlto, pronto]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pronto) return undefined;
    const aoFonte = (e) => {
      if (e.sourceId === 'feiras') {
        sincronizarPinos();
        map.once('render', sincronizarPinos);
      }
    };
    const aoMover = () => {
      sincronizarPinos();
      map.once('render', sincronizarPinos);
    };
    map.on('moveend', aoMover);
    map.on('sourcedata', aoFonte);
    map.on('idle', sincronizarPinos);
    return () => {
      map.off('moveend', aoMover);
      map.off('sourcedata', aoFonte);
      map.off('idle', sincronizarPinos);
      map.off('render', sincronizarPinos);
    };
  }, [pronto, sincronizarPinos]);

  // Trecho curado da Mearim: três pinos numerados (1, 2, 3), mostrados no zoom >= ZOOM_REGIOES ou quando selecionada.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pronto) return undefined;
    trechoMarcadoresRef.current.forEach((m) => m.marker.remove());
    trechoMarcadoresRef.current = [];
    markets.forEach((market) => {
      if (!ehTrechoCuradoMearim(market)) return;
      const info = TRECHOS_INFO[market.id];
      const regiao = regiaoDaFeira(market);
      const trecho = regiao.linhas[0];
      const selecionadaAqui = market.id === selecionadaId;
      trecho.forEach((ponto, i) => {
        const p = info.pontos[i];
        if (!p) return;
        const el = pinoNumeradoElemento({
          numero: i + 1,
          rotulo: p.rotulo,
          dia: market.day,
          selecionada: selecionadaAqui,
          onClick: () => selecionar(market),
        });
        const marker = new maplibregl.Marker({
          element: el,
          anchor: 'bottom',
        }).setLngLat(lngLat(ponto));
        trechoMarcadoresRef.current.push({ marker, el, selecionada: selecionadaAqui, noMapa: false });
      });
    });

    const atualizarTrechoMarcadores = () => {
      const emZoomAlto = map.getZoom() >= ZOOM_REGIOES;
      trechoMarcadoresRef.current.forEach((item) => {
        const mostrar = !desenhoAtivo && (emZoomAlto || item.selecionada);
        item.el.style.display = mostrar ? '' : 'none';
        if (mostrar && !item.noMapa) {
          item.marker.addTo(map);
          item.noMapa = true;
        } else if (!mostrar && item.noMapa) {
          item.marker.remove();
          item.noMapa = false;
        }
      });
    };

    atualizarTrechoMarcadores();
    map.on('zoom', atualizarTrechoMarcadores);
    map.on('moveend', atualizarTrechoMarcadores);
    return () => {
      map.off('zoom', atualizarTrechoMarcadores);
      map.off('moveend', atualizarTrechoMarcadores);
      trechoMarcadoresRef.current.forEach((m) => m.marker.remove());
      trechoMarcadoresRef.current = [];
    };
  }, [markets, selecionadaId, pronto, selecionar, desenhoAtivo]);

  // Posição do usuário e centralização única.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pronto) return;
    if (!posicaoUsuario) {
      usuarioMarkerRef.current?.remove();
      usuarioMarkerRef.current = null;
      return;
    }
    const centro = [posicaoUsuario[1], posicaoUsuario[0]];
    if (!usuarioMarkerRef.current) {
      usuarioMarkerRef.current = new maplibregl.Marker({ element: pinoUsuarioElemento(), anchor: 'center' }).setLngLat(centro).addTo(map);
    } else {
      usuarioMarkerRef.current.setLngLat(centro);
    }
    if (!centralizadoRef.current) {
      centralizadoRef.current = true;
      map.jumpTo({ center: centro, zoom: 14.5 });
    }
    // posicaoUsuario é derivado de userLat/userLon.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLat, userLon, pronto]);

  const centralizar = () => {
    if (posicaoUsuario && mapRef.current) {
      mapRef.current.easeTo({ center: [posicaoUsuario[1], posicaoUsuario[0]], zoom: 16, duration: 600 });
    } else {
      onPedirLocal?.();
    }
  };

  const enviarProposta = async () => {
    if (!selecionada || !desenho || analiseDesenho?.erro || !desenho.motivo || enviandoTrecho) return;
    if (!privacidadeAceita()) {
      setDesenho((atual) => ({ ...atual, etapa: 'privacidade' }));
      return;
    }
    if (navigator.onLine === false) {
      onAviso?.(MENSAGEM_SEM_CONEXAO_TRECHO);
      return;
    }
    setEnviandoTrecho(true);
    try {
      const local = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }),
          reject,
          { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
        );
      });
      const resultado = await proporTrecho({
        feiraId: selecionada.id,
        pontos: desenho.pontos,
        motivo: desenho.motivo,
        local,
      });
      if (resultado?.codigo === CODIGO_PRIVACIDADE_PENDENTE) {
        setDesenho((atual) => ({ ...atual, etapa: 'privacidade' }));
        return;
      }
      const codigo = resultado?.offline ? 'sem_conexao' : resultado?.codigo;
      onAviso?.(codigo === 'sem_conexao'
        ? MENSAGEM_SEM_CONEXAO_TRECHO
        : mensagemParaCodigo(codigo, 'proposta'));
      if (codigo === 'ok') {
        salvarPropostaMinha(selecionada.id, desenho.pontos);
        desenhoEtapaRef.current = null;
        focarTituloRef.current = true;
        setDesenho(null);
        onTrechoProposto?.();
      }
    } catch {
      onAviso?.('Não foi possível obter sua localização atual. Tente de novo na feira.');
    } finally {
      setEnviandoTrecho(false);
    }
  };

  return (
    <div className="map-screen flex-1 w-full z-0 relative flex flex-col min-h-0 bg-[#F1F0E9]">
      <div ref={containerRef} className="flex-1 w-full" role="region" aria-label="Mapa das feiras" />

      {erroMapa && (
        <p role="alert" className="absolute inset-x-4 top-1/2 -translate-y-1/2 mx-auto max-w-sm z-[900] bg-papel rounded-2xl p-4 text-sm leading-6 text-tinta flex items-start gap-2 shadow-[0_8px_24px_rgba(27,42,34,0.18)]">
          <TriangleAlert size={16} className="shrink-0 mt-1 text-tomate" aria-hidden="true" />
          <span>Não foi possível carregar o mapa agora. Confira a conexão e tente de novo. A lista de feiras continua funcionando.</span>
        </p>
      )}

      {/* Controles flutuantes. Ficam fora do contêiner do mapa para não repassar toques a ele. */}
      {topo && !desenho && (
        <div className="map-controls absolute inset-x-0 top-4 z-[1000] flex flex-col gap-4 pointer-events-none [&>*]:pointer-events-auto">
          {topo}
        </div>
      )}

      {!desenho && <button
        type="button"
        onClick={centralizar}
        aria-label={posicaoUsuario ? 'Centralizar na minha localização' : 'Mostrar minha localização'}
        className="map-locate absolute right-4 bottom-12 z-[950] w-12 h-12 rounded-full bg-papel text-verde border border-linha flex items-center justify-center shadow-[0_3px_10px_rgba(74,49,29,0.14)] active:scale-95 focus-visible:ring-2 focus-visible:ring-verde outline-none"
      >
        <LocateFixed size={20} aria-hidden="true" />
      </button>}

      {selecionada && !desenho && (
        <aside
          ref={cartaoRef}
          aria-label={`Cartão da Feira ${selecionada.bairro}`}
          className="sheet absolute inset-x-0 bottom-0 mx-auto max-w-md max-h-[72dvh] flex flex-col z-[1000] bg-papel rounded-t-[28px] overflow-hidden shadow-[0_-8px_30px_rgba(59,42,32,0.15)]"
        >
          <span aria-hidden="true" className="sheet-handle w-12 h-[5px] rounded-lg bg-[#CCBDA9] mx-auto mt-2.5 mb-2 shrink-0" />
          <FeiraCartao
            key={selecionada.id}
            market={selecionada}
            agora={acontecendoAgora(selecionada, agora)}
            agoraData={agora}
            diasConfirmada={diasConfirmadas[selecionada.id] ?? null}
            semFeiraHoje={Boolean(confirmacoesPublicas?.[selecionada.id]?.semFeiraHoje)}
            regiaoOrigem={regiaoSel?.origem ?? null}
            userLat={userLat}
            userLon={userLon}
            userAccuracy={userAccuracy}
            podeRota={Boolean(posicaoUsuario)}
            rotaCarregando={isLoadingRoute}
            onVerRota={() => handleFetchRoute(selecionada)}
            onFechar={fechar}
            onAviso={onAviso}
            onVotoRegistrado={onVotoRegistrado}
            onSugestaoAtualizada={onSugestaoAtualizada}
            onCorrigirTrecho={iniciarDesenho}
            onPedirLocal={onPedirLocal}
            corrigirRef={corrigirRef}
            tituloRef={tituloCartaoRef}
            onApagarDados={onApagarDados}
          />
        </aside>
      )}

      {desenho?.etapa === 'desenho' && selecionada && (
        <section
          ref={barraRef}
          tabIndex={-1}
          aria-label="Desenhar correção do trecho"
          className="absolute inset-x-0 bottom-6 z-[1000] mx-auto w-full max-w-md rounded-t-[28px] bg-papel px-4 pt-4 pb-4 shadow-[0_-8px_30px_rgba(59,42,32,0.15)] outline-none focus-visible:ring-2 focus-visible:ring-verde"
        >
          <p className="m-0 font-display text-lg font-extrabold leading-6 text-tinta">Corrigir trecho</p>
          <p className="m-0 mt-2 text-sm leading-5 text-tinta-2">Toque no mapa no começo da feira, em cada esquina e no fim.</p>
          {desenho.pontos.length > 0 && <>
            <p className="m-0 mt-2 text-xs font-bold text-tinta" role="status">
              ≈ {Math.round(analiseDesenho?.comprimento ?? 0)} m · {desenho.pontos.length} {desenho.pontos.length === 1 ? 'ponto' : 'pontos'}
            </p>
            <p className={`m-0 mt-2 min-h-6 text-xs font-bold ${desenho.pontos.length === 1 ? 'text-tinta-2' : 'text-tomate'}`} role={desenho.pontos.length >= 2 && analiseDesenho?.erro ? 'alert' : 'status'}>
              {analiseDesenho?.erro ?? '\u00a0'}
            </p>
          </>}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button type="button" disabled={desenho.pontos.length === 0} onClick={() => setDesenho((atual) => ({ ...atual, pontos: atual.pontos.slice(0, -1) }))} className="min-h-12 rounded-full border border-linha bg-papel px-2 text-xs font-extrabold text-tinta disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-verde outline-none">Desfazer</button>
            <button type="button" onClick={cancelarDesenho} className="min-h-12 rounded-full border border-linha bg-papel px-2 text-xs font-extrabold text-tinta focus-visible:ring-2 focus-visible:ring-verde outline-none">Cancelar</button>
            <button type="button" disabled={Boolean(analiseDesenho?.erro)} onClick={() => setDesenho((atual) => ({ ...atual, etapa: 'motivo' }))} className="min-h-12 rounded-full bg-verde px-2 text-xs font-extrabold text-papel disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-verde outline-none">Continuar</button>
          </div>
        </section>
      )}

      {desenho?.etapa === 'motivo' && selecionada && (
        <section aria-labelledby="motivo-titulo" className="absolute inset-x-0 bottom-6 z-[1000] mx-auto w-full max-w-md max-h-[76dvh] overflow-y-auto rounded-t-[28px] bg-papel px-4 pt-4 pb-4 shadow-[0_-8px_30px_rgba(59,42,32,0.15)]">
          <h2 ref={motivoTituloRef} tabIndex={-1} id="motivo-titulo" className="m-0 font-display text-2xl font-extrabold text-tinta outline-none">O que mudou?</h2>
          <fieldset className="mt-4 flex flex-col gap-2">
            <legend className="sr-only">Motivo da correção</legend>
            {[
              ['rua_errada', 'A feira é em outra rua'],
              ['trecho_maior', 'A feira é maior'],
              ['trecho_menor', 'A feira é menor'],
              ['mudou_de_lugar', 'A feira mudou de lugar'],
              ['outro', 'Outro motivo'],
            ].map(([valor, rotulo]) => (
              <label key={valor} className="min-h-12 rounded-xl border border-linha px-4 flex items-center gap-4 text-sm font-bold text-tinta has-[:checked]:border-verde has-[:checked]:bg-creme focus-within:ring-2 focus-within:ring-verde">
                <input type="radio" name="motivo-trecho" value={valor} checked={desenho.motivo === valor} onChange={() => setDesenho((atual) => ({ ...atual, motivo: valor }))} className="accent-verde" />
                {rotulo}
              </label>
            ))}
          </fieldset>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDesenho((atual) => ({ ...atual, etapa: 'desenho' }))} className="min-h-12 rounded-full border border-linha px-3 text-xs font-extrabold text-tinta focus-visible:ring-2 focus-visible:ring-verde outline-none">Voltar ao desenho</button>
            <button type="button" disabled={!desenho.motivo || enviandoTrecho} onClick={enviarProposta} className="min-h-12 rounded-full bg-verde px-3 text-xs font-extrabold text-papel disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-verde outline-none">{enviandoTrecho ? 'Enviando...' : 'Enviar proposta'}</button>
          </div>
        </section>
      )}

      {desenho?.etapa === 'privacidade' && (
        <aside className="absolute inset-x-0 bottom-6 z-[1000] mx-auto w-full max-w-md max-h-[76dvh] overflow-y-auto">
          <AvisoPrivacidade
            acao="proposta"
            temPendente
            onConfirmar={() => {
              if (aceitarPrivacidade()) {
                setDesenho((atual) => ({ ...atual, etapa: 'motivo' }));
                enviarProposta();
              }
            }}
            onCancelar={() => setDesenho((atual) => ({ ...atual, etapa: 'motivo' }))}
            onApagarDados={onApagarDados}
            mostrarAlca={false}
          />
        </aside>
      )}

      {/* Atribuição obrigatória: OpenFreeMap, OpenMapTiles e colaboradores do OpenStreetMap. */}
      <div
        className="map-attribution absolute inset-x-0 bottom-0 z-[900] py-1.5 px-4 bg-[#FFFDF8]/88 text-center text-[9px] leading-[1.3] text-[#4F4B44] whitespace-nowrap overflow-hidden"
      >
        <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>
        {' · '}
        <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">© OpenMapTiles</a>
        {' · Dados: '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">colaboradores do OpenStreetMap</a>
      </div>
    </div>
  );
}
