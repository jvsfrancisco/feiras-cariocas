import Fruta from './Frutas';

const FRUTAS = ['tomato', 'mango', 'lime', 'orange', 'avocado'];

// Tela de espera do mapa: usada como fallback do Suspense e, depois, por cima do mapa
// enquanto o MapLibre baixa estilo e tiles. `className` ajusta o posicionamento.
export default function CarregandoMapa({ className = '', ...resto }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-4 bg-creme ${className}`}
      {...resto}
    >
      <div className="flex flex-nowrap items-end justify-center gap-2">
        {FRUTAS.map((nome, i) => (
          // Fruta não aceita `style`; o atraso da onda vai no invólucro.
          <span
            key={nome}
            className="tomate-pula block shrink-0"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <Fruta nome={nome} className="block w-14 h-14 sm:w-20 sm:h-20" />
          </span>
        ))}
      </div>
      <p className="font-display text-2xl leading-8 font-extrabold text-tinta m-0">Abrindo o mapa...</p>
    </div>
  );
}
