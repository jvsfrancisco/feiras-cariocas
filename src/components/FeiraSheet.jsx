import { useEffect, useRef } from 'react';
import FeiraCartao from './FeiraCartao';

// Folha sobre a lista: abre o mesmo cartão com abas do mapa.
// Fecha com Esc, com toque fora ou no botão de fechar; devolve o foco a quem abriu.
export default function FeiraSheet({ market, onFechar, ...cartao }) {
  const tituloRef = useRef(null);
  const folhaRef = useRef(null);

  useEffect(() => {
    const anterior = document.activeElement;
    tituloRef.current?.focus();
    const aoTeclar = (e) => {
      if (e.key === 'Escape') {
        onFechar();
        return;
      }
      // Mantém o Tab dentro da folha.
      if (e.key === 'Tab' && folhaRef.current) {
        const itens = folhaRef.current.querySelectorAll('button:not([disabled]), a[href], [tabindex="0"]');
        if (itens.length === 0) return;
        const primeiro = itens[0];
        const ultimo = itens[itens.length - 1];
        if (e.shiftKey && document.activeElement === primeiro) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primeiro.focus();
        }
      }
    };
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      if (anterior instanceof HTMLElement) anterior.focus();
    };
  }, [onFechar]);

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-tinta/30" aria-hidden="true" onClick={onFechar} />
      <section
        ref={folhaRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Cartão da Feira ${market.bairro}`}
        className="sheet folha-feira relative w-full max-w-md max-h-[90dvh] flex flex-col bg-papel rounded-t-[28px] sm:rounded-[28px] overflow-hidden shadow-[0_-8px_30px_rgba(59,42,32,0.15)]"
      >
        <span aria-hidden="true" className="sheet-handle w-12 h-[5px] rounded-lg bg-[#CCBDA9] mx-auto mt-2.5 mb-4 shrink-0" />
          <FeiraCartao market={market} onFechar={onFechar} tituloRef={tituloRef} dentroDeDialogo {...cartao} />
      </section>
    </div>
  );
}
