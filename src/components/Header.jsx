import { Map, Plus } from 'lucide-react';
import { MarcaTomate } from './Frutas';

export default function Header({ onAddClick, onMapClick }) {
  return (
    <header className="app-header sticky top-0 z-50 bg-creme">
      <div className="max-w-7xl mx-auto px-4 h-[72px] flex items-center justify-between gap-2">
        <a href="/" aria-label="Olha a Feira, voltar para a página inicial" className="brand h-12 min-h-12 flex items-center gap-1 focus-visible:outline-2 focus-visible:outline-verde rounded-lg">
          <MarcaTomate size={30} />
          <span className="font-display text-[23px] max-[380px]:text-[20px] leading-none font-extrabold tracking-[-0.065em] text-verde whitespace-nowrap">Olha a Feira</span>
        </a>
        <div className="header-actions h-12 flex items-center gap-2">
          {onMapClick && (
            <button
              type="button"
              onClick={onMapClick}
              className="pill-btn h-12 min-h-12 px-4 max-[380px]:px-3 rounded-full bg-verde text-papel font-extrabold text-sm inline-flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-verde"
              aria-label="Abrir mapa"
            >
              <Map size={20} aria-hidden="true" />
              Mapa
            </button>
          )}
          {onAddClick && (
            <button
              type="button"
              onClick={onAddClick}
              className="round-btn w-12 h-12 min-h-12 rounded-full bg-papel text-verde-escuro border-2 border-verde inline-flex items-center justify-center focus-visible:outline-2 focus-visible:outline-verde"
              aria-label="Sugerir feira"
            >
              <Plus size={20} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
