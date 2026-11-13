import { useEffect, useState } from 'react';
import { Share, SquarePlus, X, Download } from 'lucide-react';

// Faixa para instalar o app na tela inicial.
// Android e computador (Chrome/Edge): botão "Instalar" usando o evento nativo.
// iPhone e iPad (Safari): passo a passo, porque o iOS não oferece botão.
const CHAVE_DISPENSA = 'olhafeira_instalar_dispensado';
const DIAS_DISPENSA = 14;

function estaInstalado() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function dispensadoRecentemente() {
  try {
    const quando = Number(window.localStorage.getItem(CHAVE_DISPENSA));
    return Boolean(quando) && Date.now() - quando < DIAS_DISPENSA * 86400000;
  } catch {
    return false;
  }
}

function lembrarDispensa() {
  try {
    window.localStorage.setItem(CHAVE_DISPENSA, String(Date.now()));
  } catch {
    // Sem armazenamento: a faixa volta na próxima visita, sem erro.
  }
}

function ehIos() {
  const ua = window.navigator.userAgent;
  const ehIphone = /iPhone|iPad|iPod/.test(ua);
  // Chrome e Firefox no iOS não conseguem instalar; o passo a passo só vale para o Safari.
  const ehSafari = !/CriOS|FxiOS|EdgiOS/.test(ua);
  return ehIphone && ehSafari;
}

export default function InstalarApp() {
  const [evento, setEvento] = useState(null);
  const [mostrarIos] = useState(() => ehIos());
  // iOS: aparece direto (se couber). Chromium: só aparece quando o navegador oferece a instalação.
  const [visivel, setVisivel] = useState(
    () => !estaInstalado() && !dispensadoRecentemente() && ehIos(),
  );

  useEffect(() => {
    if (estaInstalado() || dispensadoRecentemente()) return undefined;

    const aoInstalar = (e) => {
      e.preventDefault();
      setEvento(e);
      setVisivel(true);
    };
    const aoConcluir = () => setVisivel(false);

    window.addEventListener('beforeinstallprompt', aoInstalar);
    window.addEventListener('appinstalled', aoConcluir);

    return () => {
      window.removeEventListener('beforeinstallprompt', aoInstalar);
      window.removeEventListener('appinstalled', aoConcluir);
    };
  }, []);

  if (!visivel) return null;

  const instalar = async () => {
    if (!evento) return;
    evento.prompt();
    await evento.userChoice;
    setVisivel(false);
    setEvento(null);
  };

  const fechar = () => {
    lembrarDispensa();
    setVisivel(false);
  };

  return (
    <div
      role="region"
      aria-label="Instalar o app"
      className="aviso-entra fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+16px)] z-[1100] mx-auto flex max-w-md items-center gap-3 rounded-[16px] bg-tinta px-4 py-3 text-papel shadow-[0_8px_24px_rgba(59,42,32,0.28)] motion-reduce:animate-none"
    >
      <div className="min-w-0 flex-1">
        <p className="m-0 text-sm leading-6 font-bold">Instale o Olha a Feira</p>
        {mostrarIos ? (
          <p className="m-0 flex flex-wrap items-center gap-1 text-sm leading-6">
            Toque em <Share size={16} aria-label="Compartilhar" className="text-manga" /> e depois em
            <SquarePlus size={16} aria-label="Adicionar à Tela de Início" className="text-manga" />
            Adicionar à Tela de Início.
          </p>
        ) : (
          <p className="m-0 text-sm leading-6">Abra mais rápido, direto da tela inicial.</p>
        )}
      </div>

      {!mostrarIos && (
        <button
          type="button"
          onClick={instalar}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[12px] bg-manga px-3 text-sm font-bold text-tinta"
        >
          <Download size={18} aria-hidden="true" />
          Instalar
        </button>
      )}

      <button
        type="button"
        onClick={fechar}
        aria-label="Fechar aviso de instalação"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] text-papel"
      >
        <X size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
