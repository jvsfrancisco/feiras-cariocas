import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Landing from './Landing.jsx'
import InstalarApp from './components/InstalarApp.jsx'

// Rotas sem biblioteca: "/" é a landing; qualquer outro caminho (o app fica em /app) renderiza o App.
const ehLanding = window.location.pathname === '/'

// Service worker mínimo: necessário para o Chrome oferecer a instalação.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sem service worker o app continua funcionando; só não instala pelo botão.
    });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {ehLanding ? <Landing /> : <App />}
    <InstalarApp />
  </StrictMode>,
)
