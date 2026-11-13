// Elementos HTML dos marcadores do mapa (MapLibre). Sem Leaflet.
import { diaCor } from './diaCor';

const PAPEL = '#FFFDF8';

// Marca do tomate (mesmo desenho de MarcaTomate em src/components/Frutas.jsx).
const TOMATE_MARK_SVG =
  '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path fill="#D9432B" d="M4 13C3 7 8 5 14 5c6-2 13 1 14 8 2 8-3 15-12 16C8 30 3 23 4 17c0-2 0-3 0-4Z"/><path fill="#5B7A3A" d="M15 6C13 3 10 2 8 2c1 3 3 5 6 6-2 1-3 2-4 4 4 0 6-2 7-4 1 3 3 4 6 5 0-3-1-5-3-6 3 0 5-1 7-2-3-2-6-2-9 0 1-2 1-4 0-5-2 1-3 3-3 6Z"/><ellipse cx="12" cy="17" rx="4" ry="5" fill="#FFFDF8"/><ellipse cx="22" cy="17" rx="4" ry="5" fill="#FFFDF8"/><ellipse cx="13" cy="18" rx="2.6" ry="3.4" fill="#48271F"/><ellipse cx="23" cy="18" rx="2.6" ry="3.4" fill="#48271F"/><circle cx="12" cy="16.5" r="1" fill="#FFFDF8"/><circle cx="22" cy="16.5" r="1" fill="#FFFDF8"/></svg>';

function seloCheck(cor) {
  return `<span style="position:absolute;right:0;top:0;width:16px;height:16px;border-radius:50%;background:${PAPEL};box-shadow:0 0 0 2px ${cor};display:flex;align-items:center;justify-content:center"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></span>`;
}

// Pino da feira: gota 36x42 px girada (-45deg), borda de 3 px na cor papel, cor forte
// do dia, sombra pequena, marca do tomate na feira de hoje; selecionado cresce 12%;
// botão de 48x48 px de área de toque.
export function pinoFeiraElemento({
  market,
  confirmada = false,
  selecionada = false,
  agora = false,
  ehHoje = false,
  numero = '',
  atraso = null,
  onClick,
}) {
  const cor = diaCor(market.day);

  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'map-pin marcador-feira';
  el.dataset.pin = (cor.rotulo ?? '').toLocaleLowerCase('pt-BR');
  if (selecionada) el.dataset.selected = 'true';
  el.style.setProperty('--pin', cor.forte);
  el.style.setProperty('--pin-on', cor.sobreForte);
  el.style.zIndex = selecionada ? '10' : ehHoje ? '3' : '1';
  el.setAttribute(
    'aria-label',
    `Feira ${market.bairro}, ${market.address}, ${market.day}${agora ? ', acontecendo agora' : ''}${confirmada ? ', com confirmação recente' : ''}, abrir cartão`,
  );

  const reduzirMovimento = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const classes = ['pino-corpo', !reduzirMovimento && (selecionada ? 'pino-quique' : atraso !== null ? 'pino-queda' : '')].filter(Boolean).join(' ');
  const anel = agora
    ? `<span class="pino-anel" style="width:48px;height:48px;left:0;top:0;background:${cor.suave};border:2px solid ${cor.forte}"></span>`
    : '';
  const estilo = !selecionada && atraso !== null ? `animation-delay:${atraso}ms;` : '';
  const miolo = ehHoje ? TOMATE_MARK_SVG : (numero ? String(numero) : '');
  el.innerHTML = `${anel}<div class="${classes}" style="${estilo}width:48px;height:48px;display:grid;place-items:center"><span class="pin-shape"><span class="pin-number">${miolo}</span></span>${confirmada ? seloCheck(cor.forte) : ''}</div>`;
  if (market.sugestao) {
    el.style.opacity = market.sugestao === 'minha' ? '0.7' : '0.78';
    const forma = el.querySelector('.pin-shape');
    if (forma) forma.style.borderStyle = 'dashed';
    el.setAttribute('aria-label', `${market.sugestao === 'minha' ? 'Sua sugestão aguardando confirmação' : 'Sugestão da comunidade'}, ${market.nome || market.bairro}, abrir cartão`);
  }
  if (onClick) {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
  }
  return el;
}

// Posição do usuário: ponto oliva com halo.
export function pinoUsuarioElemento() {
  const el = document.createElement('div');
  el.className = 'marcador-feira';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'Sua localização atual');
  el.style.width = '40px';
  el.style.height = '40px';
  el.innerHTML = `<div style="width:40px;height:40px;border-radius:50%;background:rgba(91,122,58,0.18);display:flex;align-items:center;justify-content:center"><div style="width:16px;height:16px;border-radius:50%;background:#5B7A3A;border:3px solid ${PAPEL}"></div></div>`;
  return el;
}

// Pino numerado do trecho marcado à mão (Mearim: 1, 2, 3): gota 36x42 px girada em botão de 48x48 px.
export function pinoNumeradoElemento({ numero, rotulo, dia, selecionada = false, onClick }) {
  const cor = diaCor(dia);
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'map-pin marcador-feira marcador-numero';
  el.dataset.pin = (cor.rotulo ?? 'ter').toLocaleLowerCase('pt-BR');
  if (selecionada) el.dataset.selected = 'true';
  el.style.setProperty('--pin', cor.forte);
  el.style.setProperty('--pin-on', cor.sobreForte);
  el.style.zIndex = selecionada ? '10' : '4';
  el.setAttribute('aria-label', `Feira da Mearim, ponto ${numero}${rotulo ? `, ${rotulo}` : ''}, abrir cartão`);

  const shape = document.createElement('span');
  shape.className = 'pin-shape';
  const num = document.createElement('span');
  num.className = 'pin-number';
  num.textContent = String(numero);
  shape.append(num);
  el.append(shape);

  if (onClick) {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
  }
  return el;
}

// Círculo de agrupamento (cluster) de feiras próximas: fundo oliva, borda e número em creme #FFFBF0,
// tamanho em 3 degraus (até 9: 32 px, até 49: 40 px, 50+: 48 px).
export function pinoClusterElemento({ quantidade, onClick }) {
  const degrau = quantidade >= 50 ? 'lg' : quantidade >= 10 ? 'md' : 'sm';
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'map-cluster marcador-feira';
  el.dataset.cluster = 'true';
  el.dataset.size = degrau;
  el.style.zIndex = '2';
  el.setAttribute('aria-label', `${quantidade} feiras próximas, aproximar mapa`);
  el.textContent = String(quantidade);

  if (onClick) {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
  }
  return el;
}
