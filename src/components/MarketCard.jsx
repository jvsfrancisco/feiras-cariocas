import { CircleCheck, Clock, Navigation, Star, Store } from 'lucide-react';
import { textoConfirmada } from '../utils/confirmacoes';
import { diaCurto, formatarKm, modoSugerido, urlGoogleMaps } from '../utils/rotas';
import { diaCor } from '../utils/diaCor';
import { backendAtivo } from '../api';
import Toldo from './Toldo';

export default function MarketCard({ market, userLat, userLon, index = 0, diasConfirmada = null, agora = false, mostrarDia = false, onAbrir }) {
  const cor = diaCor(market.day);

  const verRota = () => {
    const url = urlGoogleMaps({
      // Só o endereço (sem lat/lng), como o card já fazia: as coordenadas podem ser aproximadas.
      feira: { address: market.address, bairro: market.bairro },
      userLat,
      userLon,
      modo: modoSugerido(market.distance),
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const staggerClass = index % 3 === 0 ? '' : index % 3 === 1 ? 'stagger-1' : 'stagger-2';
  const endereco = market.distance !== undefined
    ? `${market.address} · ${formatarKm(market.distance)}`
    : market.address;

  // No máximo duas etiquetas, por prioridade: Agora, confirmação, Sugerida e, só com o
  // filtro "Todos", o dia. O dia também está na linha do horário e na cor do toldo.
  // "Sem confirmação recente" é o estado comum: só vira etiqueta quando há confirmação.
  const etiquetas = [];
  if (agora) etiquetas.push('agora');
  if (diasConfirmada !== null) etiquetas.push('confirmacao');
  if (mostrarDia) etiquetas.push('dia');
  if (market.isCommunityAdded) backendAtivo ? etiquetas.unshift('sugerida') : etiquetas.push('sugerida');
  if (backendAtivo && market.sugestao) etiquetas.unshift('sugestao');
  const visiveis = etiquetas.slice(0, 2);

  return (
    <div className={`h-full animate-fade-in motion-reduce:animate-none opacity-0 motion-reduce:opacity-100 ${staggerClass}`}>
      <article className="market-card relative bg-papel rounded-t-xl rounded-b-[20px] border border-linha flex flex-col h-full shadow-[0_1px_2px_rgba(74,49,29,0.07)]">
        <Toldo cor={cor.forte} />
        {/* Corpo: começa abaixo do toldo (32 px) com 16 px de respiro */}
        <div className="card-body px-4 pt-12 pb-4 flex flex-col flex-1">
          {visiveis.length > 0 && (
            <div className="badges flex flex-wrap gap-2 mb-2">
              {visiveis.includes('agora') && (
                <span className="badge now h-6 px-2 rounded-lg bg-areia text-tinta text-[11px] font-extrabold inline-flex items-center gap-1">
                  <span aria-hidden="true" className="ponto-agora w-2 h-2 rounded-full bg-tinta" />
                  Agora
                </span>
              )}
              {visiveis.includes('confirmacao') && (diasConfirmada !== null ? (
                <span className="badge h-6 px-2 rounded-lg bg-areia text-tinta text-[11px] font-extrabold inline-flex items-center gap-1">
                  <CircleCheck size={13} strokeWidth={2.5} aria-hidden="true" />
                  {textoConfirmada(diasConfirmada)}
                </span>
              ) : (
                <span className="badge h-6 px-2 rounded-lg bg-manga-claro text-manga-escuro text-[11px] font-extrabold inline-flex items-center">
                  Sem confirmação recente
                </span>
              ))}
              {visiveis.includes('sugerida') && (
                <span className="badge h-6 px-2 rounded-lg bg-areia text-tinta text-[11px] font-extrabold inline-flex items-center gap-1">
                  <Star size={13} aria-hidden="true" />
                  {backendAtivo ? 'Só neste aparelho' : 'Sugerida'}
                </span>
              )}
              {visiveis.includes('sugestao') && <span className="badge min-h-6 rounded-lg bg-areia px-2 text-[11px] font-extrabold text-tinta inline-flex items-center">
                {market.sugestao === 'minha' ? 'Aguardando confirmação' : 'Sugerida pela comunidade'}
              </span>}
              {visiveis.includes('dia') && (
                <span
                  className="badge day h-6 px-2 rounded-lg bg-areia text-tinta text-[11px] font-extrabold inline-flex items-center"
                >
                  {cor.rotulo ?? diaCurto(market.day)}
                </span>
              )}
            </div>
          )}

          {/* O título é o botão que abre o cartão com abas; ::after estende o toque ao card todo. */}
          <h3 className="font-display text-[26px] leading-[1.08] font-extrabold tracking-[-0.045em] text-tinta">
            <button
              type="button"
              onClick={() => onAbrir?.(market)}
              aria-haspopup="dialog"
                aria-label={backendAtivo && market.sugestao
                ? `Abrir detalhes da sugestão ${market.nome || market.bairro}`
                  : backendAtivo && market.isCommunityAdded && market.nome
                    ? `Abrir detalhes da feira ${market.nome}`
                : `Abrir detalhes e fotos da feira ${market.bairro}`}
              className="card-name text-left font-[inherit] hover:underline decoration-2 underline-offset-4 after:content-[''] after:absolute after:inset-0 after:rounded-b-[20px] after:rounded-t-xl focus-visible:after:ring-2 focus-visible:after:ring-verde outline-none"
              style={{ textDecorationColor: cor.forte }}
            >
                {backendAtivo && (market.sugestao || market.isCommunityAdded) && market.nome ? market.nome : `Feira ${market.bairro}`}
            </button>
          </h3>

          <div className="card-meta my-4 flex flex-col gap-2 flex-1">
            <p className="flex items-start gap-2 text-[13px] leading-[1.45] text-tinta-2">
              <Store size={17} className="shrink-0 mt-0.5" aria-hidden="true" />
              <span>{endereco}</span>
            </p>
            <p className="flex items-start gap-2 text-[13px] leading-[1.45] text-tinta-2">
              <Clock size={17} className="shrink-0 mt-0.5" aria-hidden="true" />
              <span>{cor.rotulo ?? diaCurto(market.day)} · {market.hours}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={verRota}
            aria-label={`Ver rota para a feira de ${market.bairro}`}
            className="route-btn relative z-10 h-12 min-h-12 w-full rounded-full border-2 bg-papel font-bold text-sm inline-flex items-center justify-center gap-2 transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-verde focus-visible:ring-offset-2 outline-none"
            style={{ borderColor: cor.forte, color: cor.texto }}
          >
            <Navigation size={17} aria-hidden="true" />
            Ver rota
          </button>
        </div>
      </article>
    </div>
  );
}
