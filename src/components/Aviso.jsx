export default function Aviso({ mensagem }) {
  if (!mensagem) return null;

  return (
    <div className="fixed inset-x-4 bottom-12 z-[1100] flex justify-center pointer-events-none">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto max-w-md bg-papel border border-linha text-tinta rounded-[16px] px-4 py-3 text-xs font-bold shadow-[0_2px_8px_rgba(59,42,32,0.12)] animate-fade-in motion-reduce:animate-none"
      >
        <p className="m-0">{mensagem}</p>
      </div>
    </div>
  );
}
