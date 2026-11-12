// Símbolo do toldo de barraca (listras verde e manga, com pendentes).
// Mesmo markup do svg do cabeçalho da landing.
export default function ToldoLogo({ size = 40, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect x="4" y="8" width="8" height="12" fill="#1F5C3A" />
      <rect x="12" y="8" width="8" height="12" fill="#F0B13A" />
      <rect x="20" y="8" width="8" height="12" fill="#1F5C3A" />
      <rect x="28" y="8" width="8" height="12" fill="#F0B13A" />
      <rect x="36" y="8" width="8" height="12" fill="#1F5C3A" />
      <circle cx="8" cy="20" r="4" fill="#1F5C3A" />
      <circle cx="16" cy="20" r="4" fill="#F0B13A" />
      <circle cx="24" cy="20" r="4" fill="#1F5C3A" />
      <circle cx="32" cy="20" r="4" fill="#F0B13A" />
      <circle cx="40" cy="20" r="4" fill="#1F5C3A" />
      <path d="M8 28v14M40 28v14" stroke="#1B2A22" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}
