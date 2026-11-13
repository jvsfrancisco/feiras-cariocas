const CREME = '#FFF8EC';

export default function Toldo({ cor }) {
  return (
    <div aria-hidden="true" className="absolute -top-px left-0 right-0 h-8 overflow-hidden rounded-t-[11px] pointer-events-none drop-shadow-[0_1px_0_rgba(74,49,29,0.12)]">
      <div className="h-6" style={{ background: `linear-gradient(90deg, ${cor} 50%, ${CREME} 50%) 0 0 / 32px 24px repeat-x` }} />
      <div className="h-2" style={{ background: `radial-gradient(circle at 8px 0, ${cor} 7.8px, transparent 8px) 0 0 / 32px 8px repeat-x, radial-gradient(circle at 24px 0, ${CREME} 7.8px, transparent 8px) 0 0 / 32px 8px repeat-x` }} />
    </div>
  );
}
