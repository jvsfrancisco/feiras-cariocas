import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Landing from './Landing.jsx'

// Rotas sem biblioteca: "/" é a landing; qualquer outro caminho (o app fica em /app) renderiza o App.
const ehLanding = window.location.pathname === '/'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {ehLanding ? <Landing /> : <App />}
  </StrictMode>,
)
