import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Fruta from './components/Frutas.jsx'
import InstalarApp from './components/InstalarApp.jsx'

// Rotas sem biblioteca: "/" é a landing; qualquer outro caminho (o app fica em /app) renderiza o App.
const ehLanding = window.location.pathname === '/'
// Ponto de entrada sem exports: o Fast Refresh não se aplica a este arquivo.
// eslint-disable-next-line react-refresh/only-export-components
const App = lazy(() => import('./App.jsx'))
// eslint-disable-next-line react-refresh/only-export-components
const Landing = lazy(() => import('./Landing.jsx'))

// Service worker mínimo: necessário para o Chrome oferecer a instalação.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sem service worker o app continua funcionando; só não instala pelo botão.
    });
  });
}

const carregandoRota = (
  <div
    role="status"
    aria-live="polite"
    className="min-h-[100dvh] flex flex-col items-center justify-center bg-creme text-tinta"
  >
    <Fruta nome="tomato" className="tomate-pula w-24 h-24" />
    <span className="sr-only">Carregando...</span>
  </div>
)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={carregandoRota}>
      {ehLanding ? <Landing /> : <App />}
    </Suspense>
    <InstalarApp />
  </StrictMode>,
)
