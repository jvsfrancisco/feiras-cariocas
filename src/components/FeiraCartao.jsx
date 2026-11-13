import { useEffect, useId, useRef, useState } from 'react';
import { CircleCheck, Clock, Navigation, Store, X } from 'lucide-react';
import Aviso from './Aviso';
import AvisoPrivacidade from './AvisoPrivacidade';
import FeiraFotos from './FeiraFotos';
import SugestaoCartao from './SugestaoCartao';
import {
  aceitarPrivacidade,
  backendAtivo,
  CODIGO_PRIVACIDADE_PENDENTE,
  ehPropostaMinha,
  lerVotoTrecho,
  mensagemParaCodigo,
  MENSAGEM_SEM_CONEXAO_TRECHO,
  privacidadeAceita,
  salvarVotoTrecho,
  votarTrecho,
  sugerirFeira,
} from '../api';
import { diaNumero, localizacaoAtual, vincularFeiraLocal } from '../utils/sugestoes';
import { calculateDistance } from '../utils/distance';
import { dentroDoHorarioDaFeira, textoConfirmada } from '../utils/confirmacoes';
import { formatarKm, modoSugerido, urlGoogleMaps } from '../utils/rotas';
import { diaCor } from '../utils/diaCor';
import { diasParaTerminar } from '../utils/diasTermino';

const ABAS = [
  { id: 'sobre', rotulo: 'Sobre' },
  { id: 'fotos', rotulo: 'Fotos' },
];

// Cartão da feira com duas abas: Sobre e Fotos. Usado no mapa (cartão inferior)
// e na lista (folha sobre a lista). O dado de rota vem de fora porque no mapa
// "Ver rota" desenha a rota e na lista leva ao mapa.
export default function FeiraCartao(props) {
  if (backendAtivo && props.market.sugestao) {
    return <SugestaoCartao {...props} />;
  }
  return <FeiraCartaoComum {...props} />;
}

function FeiraCartaoComum({
  market,
  agora = false,
  agoraData = null,
  diasConfirmada = null,
  semFeiraHoje = false,
  regiaoOrigem = null,
  userLat,
  userLon,
  userAccuracy,
  podeRota = false,
  rotaCarregando = false,
  onVerRota,
  onFechar,
  onAviso,
  onVotoRegistrado,
  onSugestaoAtualizada,
  onCorrigirTrecho,
  onPedirLocal,
  corrigirRef,
  onApagarDados,
  abaInicial = 'sobre',
  tituloRef,
    dentroDeDialogo = false,
}) {
  const cor = diaCor(market.day);
  const [aba, setAba] = useState(abaInicial);
  const base = useId();
  const abasRef = useRef({});
  const avisoTimerRef = useRef(null);
  const enviarLocalRef = useRef(null);
  const [avisoLocal, setAvisoLocal] = useState('');
  const [votando, setVotando] = useState(false);
  const [votoPendente, setVotoPendente] = useState(null);
  const [mostrarPolitica, setMostrarPolitica] = useState(false);
  const [mostrarPoliticaLocal, setMostrarPoliticaLocal] = useState(false);
  const [enviandoLocal, setEnviandoLocal] = useState(false);

  const propostaAberta = backendAtivo
    && market?.trechoEmVotacao
    && Array.isArray(market.trechoEmVotacao.pontos)
    && market.trechoEmVotacao.pontos.length >= 2
    ? market.trechoEmVotacao
    : null;

  const [votosLocais, setVotosLocais] = useState(() => (
    propostaAberta?.id ? { [String(propostaAberta.id)]: lerVotoTrecho(propostaAberta.id) } : {}
  ));
  const votoAtual = propostaAberta?.id
    ? (votosLocais[String(propostaAberta.id)] ?? lerVotoTrecho(propostaAberta.id))
    : null;

  useEffect(() => () => {
    if (avisoTimerRef.current) {
      clearTimeout(avisoTimerRef.current);
    }
  }, []);

  const notificarAviso = (texto) => {
    if (!texto) return;
    if (onAviso) {
      onAviso(texto);
      return;
    }
    if (avisoTimerRef.current) {
      clearTimeout(avisoTimerRef.current);
    }
    setAvisoLocal(texto);
    avisoTimerRef.current = setTimeout(() => {
      setAvisoLocal('');
      avisoTimerRef.current = null;
    }, 6000);
  };

  const fecharAvisoLocal = () => {
    if (avisoTimerRef.current) {
      clearTimeout(avisoTimerRef.current);
      avisoTimerRef.current = null;
    }
    setAvisoLocal('');
  };

  const enviarFeiraLocal = async () => {
    if (enviandoLocal) return;
    setEnviandoLocal(true);
    try {
      const posicao = await localizacaoAtual();
      if (market.pontoLocalSalvo
        && calculateDistance(posicao.lat, posicao.lng, market.lat, market.lng) > 0.15) {
        notificarAviso(mensagemParaCodigo('fora_do_raio', 'sugerir_feira'));
        return;
      }
      const [inicio, fim] = market.hours.split('–');
      const res = await sugerirFeira({
        nome: market.nome || `Feira ${market.bairro}`, endereco: market.address, bairro: market.bairro,
        dia: diaNumero(market.day), inicio, fim, local: posicao,
      });
      if (res?.codigo === 'ok' && res.sugestao_id) {
        await vincularFeiraLocal(market.id, res.sugestao_id);
        onSugestaoAtualizada?.();
      }
      notificarAviso(mensagemParaCodigo(res?.codigo, 'sugerir_feira'));
    } catch (erro) {
      notificarAviso(erro?.message || mensagemParaCodigo('sem_conexao'));
    } finally { setEnviandoLocal(false); }
  };

  const enviarVotoTrecho = async (escolha) => {
    if (!propostaAberta?.id || votando) return;
    setVotando(true);
    try {
      const local = Number.isFinite(userLat) && Number.isFinite(userLon)
        ? { lat: userLat, lng: userLon, accuracy: userAccuracy }
        : null;
      const res = await votarTrecho(propostaAberta.id, escolha, local);
      if (res?.codigo === CODIGO_PRIVACIDADE_PENDENTE) {
        setVotoPendente(escolha);
        setMostrarPolitica(true);
        return;
      }
      if (res?.offline || res?.codigo === 'sem_conexao') {
        notificarAviso(MENSAGEM_SEM_CONEXAO_TRECHO);
        return;
      }
      if (res?.codigo === 'ok') {
        salvarVotoTrecho(propostaAberta.id, escolha);
        setVotosLocais((atual) => ({ ...atual, [String(propostaAberta.id)]: escolha }));
        notificarAviso(mensagemParaCodigo('ok', 'voto'));
        onVotoRegistrado?.();
      } else {
        notificarAviso(mensagemParaCodigo(res?.codigo, 'voto'));
      }
    } catch {
      notificarAviso(MENSAGEM_SEM_CONEXAO_TRECHO);
    } finally {
      setVotando(false);
    }
  };

  const lidarVotoTrecho = (escolha) => {
    if (!propostaAberta?.id || votando) return;
    if (backendAtivo && !privacidadeAceita()) {
      setVotoPendente(escolha);
      setMostrarPolitica(true);
      return;
    }
    enviarVotoTrecho(escolha);
  };

  const confirmarPoliticaVoto = () => {
    if (!aceitarPrivacidade()) return;
    const escolhida = votoPendente;
    setMostrarPolitica(false);
    setVotoPendente(null);
    if (escolhida) {
      enviarVotoTrecho(escolhida);
    }
  };

  const ehTrechoCurado = regiaoOrigem === 'manual'
    && (!backendAtivo || (String(market.id) === '49' && (!market.trechoOrigem || market.trechoOrigem === 'curado')));
  const diasTermino = propostaAberta ? diasParaTerminar(propostaAberta, agoraData) : null;
  const propostaMinha = propostaAberta && ehPropostaMinha(market.id, propostaAberta);

  const idAba = (id) => `${base}-aba-${id}`;
  const idPainel = (id) => `${base}-painel-${id}`;

  // Setas, Home e End movem o foco entre as abas (padrão WAI-ARIA).
  const aoTeclar = (e) => {
    const i = ABAS.findIndex((a) => a.id === aba);
    let alvo = null;
    if (e.key === 'ArrowRight') alvo = ABAS[(i + 1) % ABAS.length];
    else if (e.key === 'ArrowLeft') alvo = ABAS[(i - 1 + ABAS.length) % ABAS.length];
    else if (e.key === 'Home') alvo = ABAS[0];
    else if (e.key === 'End') alvo = ABAS[ABAS.length - 1];
    if (!alvo) return;
    e.preventDefault();
    setAba(alvo.id);
    abasRef.current[alvo.id]?.focus();
  };

  const endereco = market.distance !== undefined
    ? `${market.address} · ${formatarKm(market.distance)}`
    : `${market.address}, ${market.bairro}`;
  const urlMaps = urlGoogleMaps({ feira: market, userLat, userLon, modo: modoSugerido(market.distance) });

  const clicarRota = () => {
    if (podeRota && onVerRota) {
      onVerRota();
    } else if (onVerRota && !userLat && !userLon) {
      window.open(urlMaps, '_blank', 'noopener,noreferrer');
    }
  };

  const clicarCorrigir = () => {
    if (!dentroDoHorarioDaFeira(market, new Date())) {
      notificarAviso('Dá para corrigir o trecho durante a feira, estando no local.');
      return;
    }
    if (!Number.isFinite(userLat) || !Number.isFinite(userLon)) {
      notificarAviso('Ative sua localização para corrigir o trecho estando na feira.');
      onPedirLocal?.();
      return;
    }
    onCorrigirTrecho?.(market);
  };

  if (backendAtivo && mostrarPolitica) {
    return (
      <AvisoPrivacidade
          dentroDeDialogo={backendAtivo && dentroDeDialogo}
        acao="voto"
        temPendente={Boolean(votoPendente)}
        onConfirmar={confirmarPoliticaVoto}
        onCancelar={() => {
          setMostrarPolitica(false);
          setVotoPendente(null);
        }}
        onApagarDados={onApagarDados}
        mostrarAlca={false}
        className="overflow-y-auto min-h-0"
      />
    );
  }

  if (backendAtivo && mostrarPoliticaLocal) {
      return <AvisoPrivacidade acao="sugestão" temPendente mostrarAlca={false} dentroDeDialogo={dentroDeDialogo} onApagarDados={onApagarDados}
      onCancelar={() => { setMostrarPoliticaLocal(false); requestAnimationFrame(() => enviarLocalRef.current?.focus()); }}
      onConfirmar={() => { aceitarPrivacidade(); setMostrarPoliticaLocal(false); enviarFeiraLocal(); requestAnimationFrame(() => enviarLocalRef.current?.focus()); }} />;
  }

  return (
    <div className="flex flex-col min-h-0 px-4 pb-6">
      <div className="sheet-top flex items-start justify-between gap-2 shrink-0">
        <div>
          <h2
            ref={tituloRef}
            tabIndex={-1}
            className="font-display text-[27px] leading-[1.05] font-extrabold tracking-[-0.05em] text-tinta outline-none"
          >
              {backendAtivo && market.isCommunityAdded && market.nome ? market.nome : `Feira ${market.bairro}`}
          </h2>
          {backendAtivo && market.isCommunityAdded && <span className="inline-flex rounded-lg bg-areia px-2 py-1 text-xs font-extrabold text-tinta">Só neste aparelho</span>}
          <p className="sheet-location text-xs text-tinta-2 mt-2 mb-4">
            {market.bairro} · Rio de Janeiro{agora ? ' · Acontecendo agora' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar cartão"
          className="sheet-close w-12 h-12 -mt-2 -mr-2 rounded-full text-tinta hover:bg-creme flex items-center justify-center shrink-0 focus-visible:ring-2 focus-visible:ring-verde outline-none"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Informações da feira"
        onKeyDown={aoTeclar}
        className="tabs border-b border-linha grid grid-cols-2 mb-4 shrink-0"
      >
        {ABAS.map(({ id, rotulo }) => {
          const ativa = aba === id;
          return (
            <button
              key={id}
              ref={(el) => { abasRef.current[id] = el; }}
              type="button"
              role="tab"
              id={idAba(id)}
              aria-selected={ativa}
              aria-controls={idPainel(id)}
              tabIndex={ativa ? 0 : -1}
              onClick={() => setAba(id)}
              className={`tab h-12 text-sm font-extrabold inline-flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-verde outline-none ${
                ativa ? 'text-verde border-b-[3px] border-verde' : 'text-tinta-2'
              }`}
            >
              {rotulo}
            </button>
          );
        })}
      </div>

      <div className="overflow-y-auto min-h-0 overscroll-contain">
        {aba === 'sobre' ? (
          <div role="tabpanel" id={idPainel('sobre')} aria-labelledby={idAba('sobre')} className="tab-panel">
            <div className="detail-grid flex flex-col gap-4">
              <p className="detail-line flex items-start gap-2 text-[13px] leading-[1.45]">
                <Clock size={19} className="shrink-0 mt-0.5 text-tinta-2" aria-hidden="true" />
                <span>
                  <strong className="block text-tinta font-bold text-[13px]">{market.day} · {market.hours}</strong>
                  <span className="text-tinta-2">{backendAtivo && market.isCommunityAdded ? 'Horário salvo neste aparelho.' : 'Horário informado pela Prefeitura do Rio.'}</span>
                </span>
              </p>
              <p className="detail-line flex items-start gap-2 text-[13px] leading-[1.45]">
                <CircleCheck size={19} className="shrink-0 mt-0.5 text-tinta-2" aria-hidden="true" />
                <span>
                  <strong className="block text-tinta font-bold text-[13px]">
                    {backendAtivo && semFeiraHoje
                      ? 'Aviso de hoje'
                      : diasConfirmada !== null
                        ? 'Confirmação recente'
                        : 'Confirmação'}
                  </strong>
                  <span className="text-tinta-2">
                    {backendAtivo
                      ? semFeiraHoje
                        ? 'Pessoas dizem que não teve feira hoje.'
                        : diasConfirmada !== null
                          ? `${textoConfirmada(diasConfirmada)}.`
                          : 'Sem confirmação recente.'
                      : diasConfirmada !== null
                        ? `${textoConfirmada(diasConfirmada)}, neste aparelho.`
                        : 'Sem confirmação recente neste aparelho.'}
                  </span>
                </span>
              </p>
              <p className="detail-line flex items-start gap-2 text-[13px] leading-[1.45]">
                <Store size={19} className="shrink-0 mt-0.5 text-tinta-2" aria-hidden="true" />
                <span>
                  <strong className="block text-tinta font-bold text-[13px]">{endereco}</strong>
                  <span className="text-tinta-2">Rio de Janeiro, RJ</span>
                </span>
              </p>
              <p className="approx bg-[#F4EFE5] p-3 rounded-xl text-xs leading-[1.5] text-[#55483B]">
                {regiaoOrigem === 'manual'
                  ? ehTrechoCurado
                    ? 'Trecho marcado à mão no mapa, da borda do mato até a esquina da Grajaú.'
                    : 'Trecho marcado pela comunidade.'
                  : 'Região aproximada: a rua inteira, segundo o OpenStreetMap. O trecho exato depende de quem frequenta.'}
              </p>

              {propostaAberta && (
                <div className="bg-[#F4EFE5] p-3 rounded-xl text-xs leading-[1.5] text-[#55483B] flex flex-col gap-2.5">
                  <p className="font-bold text-tinta m-0">
                    Trecho em votação · {diasTermino === 0 ? 'termina hoje' : `termina em ${diasTermino} ${diasTermino === 1 ? 'dia' : 'dias'}`}
                  </p>
                  {propostaMinha ? (
                    <p className="m-0">Você sugeriu este trecho. Ele passa a valer quando outras pessoas confirmarem.</p>
                  ) : <>
                    <p className="m-0">
                      Alguém sugeriu outro trecho para esta feira, na linha tracejada do mapa. Ele está certo?
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={votando}
                      aria-pressed={votoAtual === 'aprovo'}
                      onClick={() => lidarVotoTrecho('aprovo')}
                      className={`h-12 px-3 rounded-full font-extrabold text-xs inline-flex items-center justify-center transition-colors disabled:opacity-50 active:scale-95 focus-visible:ring-2 focus-visible:ring-verde outline-none ${
                        votoAtual === 'aprovo'
                          ? 'bg-verde text-papel border-2 border-verde'
                          : 'bg-papel text-verde-escuro border-2 border-verde'
                      }`}
                    >
                      Está certo
                    </button>
                    <button
                      type="button"
                      disabled={votando}
                      aria-pressed={votoAtual === 'nego'}
                      onClick={() => lidarVotoTrecho('nego')}
                      className={`h-12 px-3 rounded-full font-extrabold text-xs inline-flex items-center justify-center transition-colors disabled:opacity-50 active:scale-95 focus-visible:ring-2 focus-visible:ring-verde outline-none ${
                        votoAtual === 'nego'
                          ? 'bg-tomate text-papel border-2 border-tomate'
                          : 'bg-papel text-tinta border-2 border-linha'
                      }`}
                    >
                      Não é aqui
                    </button>
                    </div>
                  {votoAtual && (
                    <p className="text-[11px] text-tinta-2 m-0" role="status">
                      Seu voto: <strong className="text-tinta">{votoAtual === 'aprovo' ? 'Está certo' : 'Não é aqui'}</strong>. Toque no outro botão para trocar.
                    </p>
                  )}
                  </>}
                </div>
              )}
            </div>

            <div className="sheet-actions grid grid-cols-2 gap-2 mt-6">
              {backendAtivo && market.isCommunityAdded && <button type="button" disabled={enviandoLocal}
                ref={enviarLocalRef}
                onClick={() => privacidadeAceita() ? enviarFeiraLocal() : setMostrarPoliticaLocal(true)}
                className="col-span-2 min-h-12 rounded-full border-2 border-verde bg-verde px-4 text-sm font-extrabold text-papel focus-visible:ring-2 focus-visible:ring-verde disabled:opacity-50">
                {enviandoLocal ? 'Enviando...' : 'Enviar para a comunidade'}
              </button>}
              {backendAtivo && market.coord_precisa && !market.trechoEmVotacao && onCorrigirTrecho && (
                <button
                  ref={corrigirRef}
                  type="button"
                  onClick={clicarCorrigir}
                  className="col-span-2 min-h-12 px-4 rounded-full border-2 border-verde bg-papel text-verde-escuro font-extrabold text-sm focus-visible:ring-2 focus-visible:ring-verde focus-visible:ring-offset-2 outline-none"
                >
                  Corrigir trecho
                </button>
              )}
              <button
                type="button"
                onClick={clicarRota}
                disabled={rotaCarregando}
                aria-label={rotaCarregando ? 'Calculando rota' : 'Ver rota'}
                className="route-btn h-12 min-h-12 px-2 rounded-full bg-verde border-2 border-verde text-papel font-extrabold text-xs inline-flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 focus-visible:ring-2 focus-visible:ring-verde focus-visible:ring-offset-2 outline-none"
              >
                <Navigation size={17} aria-hidden="true" className={rotaCarregando ? 'animate-pulse' : ''} />
                <span role="status">{rotaCarregando ? 'Calculando...' : 'Ver rota'}</span>
              </button>
              <a
                href={urlMaps}
                target="_blank"
                rel="noopener noreferrer"
                className="secondary-btn h-12 min-h-12 px-2 rounded-full border-2 border-verde bg-papel text-verde-escuro font-extrabold text-xs inline-flex items-center justify-center text-center focus-visible:ring-2 focus-visible:ring-verde focus-visible:ring-offset-2 outline-none"
              >
                Abrir no Google Maps
              </a>
            </div>
          </div>
        ) : (
          <div role="tabpanel" id={idPainel('fotos')} aria-labelledby={idAba('fotos')} className="tab-panel">
            <FeiraFotos key={backendAtivo ? market.id : undefined} feiraId={market.id} bairro={market.bairro} cor={cor} market={market} userLat={userLat} userLon={userLon} userAccuracy={userAccuracy} onPedirLocal={onPedirLocal} />
          </div>
        )}
      </div>
      {!onAviso && backendAtivo && <Aviso mensagem={avisoLocal} onFechar={fecharAvisoLocal} />}
    </div>
  );
}
