import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Polyline, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import Fruta, { MarcaTomate } from './components/Frutas';
import { INITIAL_FEIRAS } from './data/feiras';
import './landing/landing.css';

const HERO_PINS = [
  { classe: 'pin pin--one', rotulo: 'seg' },
  { classe: 'pin pin--two', rotulo: 'qua' },
  { classe: 'pin pin--three', rotulo: 'ter' },
  { classe: 'pin pin--four', rotulo: 'sex' },
  { classe: 'pin pin--five', rotulo: 'sáb' },
];

// Trecho da Rua Mearim (vem do mesmo registro, id 49, usado pelo app)
const MEARIM = INITIAL_FEIRAS.find((f) => f.id === '49');
const TRECHO_MEARIM = MEARIM?.trecho ?? [
  [-22.923807, -43.259737],
  [-22.924313, -43.261316],
  [-22.923528, -43.261733],
];

const CENTRO_TRECHO = [-22.9239, -43.2607];

const ICONES_PONTOS = [1, 2, 3].map((numero) =>
  L.divIcon({
    className: 'map-pin-wrap',
    html: `<span class="map-pin-badge">${numero}</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  }),
);

export default function Landing() {
  const heroArtRef = useRef(null);

  // Os olhos do tomate seguem o cursor (desligado com reduced motion)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) return undefined;

    const aoMover = (event) => {
      const hero = heroArtRef.current?.querySelector('.hero-tomato');
      if (!hero || mq.matches) return;
      const box = hero.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      const angle = Math.atan2(dy, dx);
      const distance = Math.min(5, Math.hypot(dx, dy) / 80);
      hero.style.setProperty('--look-x', `${Math.cos(angle) * distance}px`);
      hero.style.setProperty('--look-y', `${Math.sin(angle) * distance}px`);
    };

    window.addEventListener('pointermove', aoMover, { passive: true });
    return () => window.removeEventListener('pointermove', aoMover);
  }, []);

  return (
    <div className="lp">
      <header className="site-header wrap">
        <a className="brand" href="#topo" aria-label="Olha a Feira, voltar ao topo">
          <MarcaTomate size={34} />
          <span>Olha a Feira</span>
        </a>
        <a className="btn btn-small" href="/app">
          Abrir o app <span className="arrow" aria-hidden="true">↗</span>
        </a>
      </header>

      <main>
        <section className="hero wrap" id="topo" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">Feiras livres do Rio no mapa</p>
            <h1 id="hero-title">
              Onde tem feira
              <br />
              <span className="h1-second">
                hoje<span className="h1-dot" aria-hidden="true"></span>
              </span>
            </h1>
            <p className="hero-lead">
              A Prefeitura do Rio tem a lista de todas as feiras livres da cidade, mas ela está num PDF: sem mapa, sem horário conferido e sem aviso quando a feira muda. O Olha a Feira põe essa lista num mapa e deixa quem vai à feira dizer se ela está de pé.
            </p>
            <div className="hero-actions">
              <a className="btn" href="/app">
                Abrir o app <span className="arrow" aria-hidden="true">↗</span>
              </a>
              <a className="text-link" href="#como">
                Como funciona <span aria-hidden="true">↘</span>
              </a>
            </div>
          </div>

          <div
            ref={heroArtRef}
            className="hero-art"
            role="img"
            aria-label="Tomate mascote cercado de pinos nas cores dos dias da semana"
          >
            <div className="hero-disc"></div>
            <Fruta nome="tomato" className="hero-tomato" />
            {HERO_PINS.map((pin) => (
              <span key={pin.rotulo} className={pin.classe}>
                <svg viewBox="0 0 30 38" aria-hidden="true">
                  <path d="M15 1C7 1 1 7 1 15c0 9 14 22 14 22s14-13 14-22C29 7 23 1 15 1Z" />
                  <circle cx="15" cy="15" r="5" fill="#FFFDF8" />
                </svg>
                {pin.rotulo}
              </span>
            ))}
          </div>
        </section>

        <svg className="awning" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="awning-pattern" width="64" height="40" patternUnits="userSpaceOnUse">
              <rect width="64" height="26" fill="#FFF8EC" />
              <rect width="32" height="26" fill="#5B7A3A" />
              <circle cx="16" cy="26" r="14" fill="#5B7A3A" />
              <circle cx="48" cy="26" r="14" fill="#FFF8EC" />
            </pattern>
          </defs>
          <rect width="100%" height="40" fill="url(#awning-pattern)" />
        </svg>

        <section className="problem" id="porque" aria-labelledby="problem-title">
          <div className="problem-inner wrap">
            <div>
              <h2 id="problem-title">Feira livre não é só um endereço.</h2>
            </div>
            <div className="problem-copy">
              <p>
                Ela muda de dia, de horário e às vezes de lugar. A lista oficial é um arquivo que a Prefeitura publica, e ninguém avisa quando alguma coisa muda. Quem chega cedo e não encontra a feira perde a viagem.
              </p>
              <p>
                <strong>Já foi à feira e ela não estava lá?</strong> Aqui, quem chega confirma, e o app mostra quando foi a última confirmação neste aparelho.
              </p>
            </div>
          </div>
        </section>

        <section className="how wrap" id="como" aria-labelledby="how-title">
          <div className="section-head">
            <div>
              <h2 id="how-title">Como funciona, em três passos.</h2>
            </div>
            <p className="aside">Dados oficiais no mapa. Sua confirmação fica só no seu aparelho.</p>
          </div>
          <div className="steps">
            <article className="step">
              <span className="step-num">1</span>
              <h3>Veja a feira no mapa</h3>
              <p>A lista oficial da Prefeitura aparece no mapa, com cada feira no seu endereço.</p>
            </article>
            <article className="step">
              <span className="step-num">2</span>
              <h3>Confirme quando chegar</h3>
              <p>Perto da feira, no horário dela, o app pergunta se ela está acontecendo. Um toque: tem ou não tem.</p>
            </article>
            <article className="step">
              <span className="step-num">3</span>
              <h3>Veja a data da última confirmação</h3>
              <p>Confirmação recente aparece com a data. As confirmações ficam só neste aparelho.</p>
            </article>
          </div>
        </section>

        <section className="map-section" id="trecho" aria-labelledby="map-title">
          <div className="map-grid wrap">
            <div className="map-copy">
              <p className="eyebrow">Um exemplo no Grajaú</p>
              <h2 id="map-title">Feira é um trecho de rua.</h2>
              <p>
                Na Rua Mearim, em Grajaú, a feira fica na borda do mato, entre a Gurupi e a Mearim, e vira a esquina até a Grajaú. Um pino não mostra isso.
              </p>
              <span className="day-label">Terça-feira · Rua Mearim</span>
            </div>

            <figure className="map-figure">
              <div
                className="map-board"
                role="region"
                aria-label="Mapa do trecho da feira na Rua Mearim, entre as ruas Gurupi e Grajaú, com três pontos numerados"
              >
                <MapContainer
                  center={CENTRO_TRECHO}
                  zoom={17}
                  bounds={TRECHO_MEARIM.length > 0 ? TRECHO_MEARIM : undefined}
                  boundsOptions={{ paddingTopLeft: [48, 48], paddingBottomRight: [72, 80] }}
                  scrollWheelZoom={false}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">colaboradores do OpenStreetMap</a>'
                  />
                  {TRECHO_MEARIM.length > 1 && (
                    <>
                      <Polyline
                        positions={TRECHO_MEARIM}
                        pathOptions={{
                          color: '#FFFDF8',
                          weight: 20,
                          opacity: 1,
                          lineCap: 'round',
                          lineJoin: 'round',
                        }}
                      />
                      <Polyline
                        positions={TRECHO_MEARIM}
                        pathOptions={{
                          color: '#C73A22',
                          weight: 11,
                          opacity: 1,
                          lineCap: 'round',
                          lineJoin: 'round',
                        }}
                      />
                      <Polyline
                        positions={TRECHO_MEARIM}
                        pathOptions={{
                          color: '#FFFDF8',
                          weight: 2.5,
                          opacity: 1,
                          dashArray: '1 16',
                          lineCap: 'round',
                        }}
                      />
                      {TRECHO_MEARIM.slice(0, 3).map((pos, idx) => (
                        <Marker
                          key={`mearim-pin-${idx + 1}`}
                          position={pos}
                          icon={ICONES_PONTOS[idx]}
                          interactive={false}
                          keyboard={false}
                        />
                      ))}
                    </>
                  )}
                </MapContainer>

                <div className="map-legend" aria-label="Trecho da feira · Rua Mearim · Grajaú">
                  <span className="map-legend-bar" aria-hidden="true" />
                  <div className="map-legend-text">
                    <strong>Trecho da feira</strong>
                    <span>Rua Mearim · Grajaú</span>
                  </div>
                </div>
              </div>
              <figcaption>
                Mapa © colaboradores do OpenStreetMap. A linha mostra o percurso da feira na Rua Mearim, entre as ruas Gurupi e Grajaú, a partir de três cruzamentos.
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="faq wrap" id="perguntas" aria-labelledby="faq-title">
          <div>
            <h2 id="faq-title">Perguntas rápidas.</h2>
          </div>
          <div className="faq-list">
            <details>
              <summary>É da Prefeitura?</summary>
              <p>
                Os dados das feiras vêm da lista da Prefeitura do Rio. As confirmações de quem vai à feira ficam só neste aparelho e não são enviadas a ninguém.
              </p>
            </details>
            <details>
              <summary>Preciso de conta?</summary>
              <p>
                Não. O app não tem cadastro nem login. Tudo o que você confirma fica neste aparelho.
              </p>
            </details>
            <details>
              <summary>Por que pedem localização?</summary>
              <p>
                Para mostrar as feiras perto de você e perguntar se a feira está acontecendo quando você chega. Sua posição não fica ligada ao seu nome. Ao tocar em rota ou em Google Maps, sua posição é enviada a esses serviços para calcular o caminho.
              </p>
            </details>
          </div>
        </section>

        <section className="final-cta" id="abrir" aria-labelledby="final-title">
          <div className="final-inner wrap">
            <div>
              <h2 id="final-title">Antes de sair, veja se a feira está lá.</h2>
            </div>
            <a className="btn" href="/app">
              Ver feiras perto de mim <span className="arrow" aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-inner wrap">
          <a className="footer-brand" href="#topo">
            <MarcaTomate size={28} />
            Olha a Feira
          </a>
          <p className="footer-data">Dados da Prefeitura do Rio · olhafeira.tech</p>
          <p className="footer-credit">
            Feito por{' '}
            <a href="https://joao.quazz.com.br" target="_blank" rel="noopener noreferrer">
              João Victor
            </a>
            <Fruta nome="orange" className="footer-fruit" />
          </p>
        </div>
      </footer>
    </div>
  );
}
