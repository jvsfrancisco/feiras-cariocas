// Service worker mínimo: deixa o app instalável e prepara os avisos de feira.
// Não guarda cache: toda requisição segue direto para a rede.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
