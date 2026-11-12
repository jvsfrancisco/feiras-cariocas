const CHAVE_MINHAS = 'olhafeira_fotos_enviadas';
const CHAVE_OCULTAS = 'olhafeira_fotos_denunciadas';
const BANCO = 'olhafeira-fotos';
const LOJA = 'fotosEnviadas';

function lerLista(chave) {
  try {
    const valor = JSON.parse(localStorage.getItem(chave) || '[]');
    return Array.isArray(valor) ? valor : [];
  } catch { return []; }
}

function gravarLista(chave, lista) {
  localStorage.setItem(chave, JSON.stringify(lista));
}

export function lerMinhasFotos() { return lerLista(CHAVE_MINHAS); }
export function salvarMinhaFoto(foto) {
  const lista = lerMinhasFotos().filter((item) => item.id !== foto.id);
  gravarLista(CHAVE_MINHAS, [foto, ...lista]);
}
export function esquecerMinhaFoto(id) {
  gravarLista(CHAVE_MINHAS, lerMinhasFotos().filter((item) => item.id !== id));
}
export function lerFotosOcultas() { return lerLista(CHAVE_OCULTAS); }
export function ocultarFoto(id) {
  gravarLista(CHAVE_OCULTAS, [...new Set([...lerFotosOcultas(), id])]);
}

function abrirBanco() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BANCO, 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('fotos')) req.result.createObjectStore('fotos');
      if (!req.result.objectStoreNames.contains(LOJA)) req.result.createObjectStore(LOJA);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Banco bloqueado'));
  });
}

async function noBanco(modo, executar) {
  const db = await abrirBanco();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(LOJA, modo);
      const req = executar(tx.objectStore(LOJA));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export function salvarMiniatura(id, blob) {
  return noBanco('readwrite', (loja) => loja.put(blob, id));
}
export function lerMiniatura(id) {
  return noBanco('readonly', (loja) => loja.get(id));
}
export function apagarMiniatura(id) {
  return noBanco('readwrite', (loja) => loja.delete(id));
}

export async function limparFotosEnviadas() {
  try { await noBanco('readwrite', (loja) => loja.clear()); }
  catch { /* armazenamento indisponível */ }
  try {
    localStorage.removeItem(CHAVE_MINHAS);
    localStorage.removeItem(CHAVE_OCULTAS);
  } catch { /* armazenamento indisponível */ }
}
