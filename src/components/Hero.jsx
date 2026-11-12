import { useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import Fruta from './Frutas';

export default function Hero({ searchTerm, setSearchTerm }) {
  const frutaRef = useRef(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const aoMover = (event) => {
      const svg = frutaRef.current?.querySelector('svg');
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const len = Math.hypot(dx, dy) || 1;
      svg.style.setProperty('--look-x', `${(dx / len) * 5}px`);
      svg.style.setProperty('--look-y', `${(dy / len) * 5}px`);
    };
    window.addEventListener('pointermove', aoMover);
    return () => window.removeEventListener('pointermove', aoMover);
  }, []);
  return (
    <section className="app-hero hero" aria-labelledby="hero-title">
      <div className="max-w-7xl mx-auto px-4 relative">
        <h1 id="hero-title" className="font-display text-[34px] max-[380px]:text-[32px] leading-[1.06] font-extrabold tracking-[-0.05em] text-tinta max-w-[230px] max-[380px]:max-w-[205px] relative z-10">
          Feira fresca, perto de você
        </h1>
        <div ref={frutaRef} className="hero-fruit absolute top-0 right-4 w-24 h-24 max-[380px]:w-[88px] max-[380px]:h-[88px] rotate-[8deg] fruit-sway" aria-hidden="true">
          <Fruta nome="tomato" className="w-full h-full" />
        </div>
        <label className="search-wrap relative block mt-6 z-10 max-w-xl">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-tinta-2 pointer-events-none" aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar feiras pelo bairro"
            className="search block w-full h-14 pl-12 pr-4 rounded-full border border-linha bg-papel text-tinta text-[15px] placeholder:text-tinta-2 shadow-[0_1px_0_rgba(59,42,32,0.06)] focus-visible:outline-2 focus-visible:outline-verde"
            placeholder="Qual o seu bairro?"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>
      </div>
    </section>
  );
}
