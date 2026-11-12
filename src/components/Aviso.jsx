import { Info, X } from 'lucide-react';

export default function Aviso({ mensagem, onFechar }) {
  if (!mensagem) return null;

  return (
    <div
      key={mensagem}
      role="status"
      aria-live="polite"
      className="aviso-entra fixed inset-x-4 top-[calc(env(safe-area-inset-top)+16px)] z-[1100] mx-auto max-w-md flex items-center gap-2 bg-tinta text-papel rounded-[16px] py-2 pl-4 pr-2 shadow-[0_8px_24px_rgba(59,42,32,0.28)]"
    >
      <Info size={20} className="shrink-0 text-manga" aria-hidden="true" />
      <p className="m-0 flex-1 text-sm leading-6 font-bold">{mensagem}</p>
      <button
        type="button"
        onClick={onFechar}
        aria-label="Fechar aviso"
        className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-papel active:scale-95 focus-visible:ring-2 focus-visible:ring-manga outline-none"
      >
        <X size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
