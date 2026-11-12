// Fotos das feiras guardadas só neste aparelho, em IndexedDB. Não existe servidor.
// Banco 'olhafeira-fotos', um registro por feira (chave = id da feira) com até 12 fotos.
// Cada foto é reduzida no aparelho para no máximo 1024 px (maior lado) em JPEG 0,8.
const BANCO = 'olhafeira-fotos';
const LOJA = 'fotos';
export const MAX_FOTOS = 12;
const LADO_MAX = 1024;
const QUALIDADE = 0.8;

function abrirBanco() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível'));
      return;
    }
    let req;
    try {
      req = indexedDB.open(BANCO, 2);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(LOJA)) req.result.createObjectStore(LOJA);
      if (!req.result.objectStoreNames.contains('fotosEnviadas')) req.result.createObjectStore('fotosEnviadas');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Falha ao abrir o banco'));
    req.onblocked = () => reject(new Error('Banco bloqueado'));
  });
}

// Lê o registro, deixa o chamador alterar a lista e grava, tudo numa transação só.
async function transacao(feiraId, modo, alterar) {
  const db = await abrirBanco();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(LOJA, modo);
      const loja = tx.objectStore(LOJA);
      const chave = String(feiraId);
      const leitura = loja.get(chave);
      let resultado;
      let falha = null;
      leitura.onsuccess = () => {
        try {
          const lista = Array.isArray(leitura.result) ? leitura.result : [];
          const nova = alterar(lista);
          if (nova) loja.put(nova, chave);
          resultado = nova ?? lista;
        } catch (e) {
          falha = e;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(resultado);
      tx.onerror = () => reject(falha ?? tx.error ?? new Error('Falha na transação'));
      tx.onabort = () => reject(falha ?? tx.error ?? new Error('Transação cancelada'));
    });
  } finally {
    db.close();
  }
}

export function listarFotos(feiraId) {
  return transacao(feiraId, 'readonly', () => null);
}

export function removerFoto(feiraId, fotoId) {
  return transacao(feiraId, 'readwrite', (lista) => lista.filter((f) => f.id !== fotoId));
}

export async function reChavearFotos(idLocal, idServidor) {
  const db = await abrirBanco();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(LOJA, 'readwrite');
      const loja = tx.objectStore(LOJA);
      const origem = loja.get(String(idLocal));
      const destino = loja.get(String(idServidor));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error ?? new Error('Falha ao mover fotos'));
      tx.onabort = () => reject(tx.error ?? new Error('Falha ao mover fotos'));
      origem.onsuccess = () => {
        if (!Array.isArray(origem.result) || origem.result.length === 0) return;
        if (destino.readyState !== 'done') {
          destino.addEventListener('success', () => {
            loja.put([...(Array.isArray(destino.result) ? destino.result : []), ...origem.result].slice(0, MAX_FOTOS), String(idServidor));
            loja.delete(String(idLocal));
          }, { once: true });
        } else {
          loja.put([...(Array.isArray(destino.result) ? destino.result : []), ...origem.result].slice(0, MAX_FOTOS), String(idServidor));
          loja.delete(String(idLocal));
        }
      };
    });
  } finally { db.close(); }
}

async function reduzir(arquivo) {
  let origem;
  let largura;
  let altura;
  if (typeof createImageBitmap === 'function') {
    try {
      origem = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
    } catch {
      origem = null;
    }
  }
  if (origem) {
    largura = origem.width;
    altura = origem.height;
  } else {
    const url = URL.createObjectURL(arquivo);
    try {
      origem = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Imagem inválida'));
        img.src = url;
      });
      largura = origem.naturalWidth;
      altura = origem.naturalHeight;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const escala = Math.min(1, LADO_MAX / Math.max(largura, altura));
  const w = Math.max(1, Math.round(largura * escala));
  const h = Math.max(1, Math.round(altura * escala));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // Fundo papel: PNG com transparência não vira preto no JPEG.
  ctx.fillStyle = '#FFFBF0';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(origem, 0, 0, w, h);
  if (typeof origem.close === 'function') origem.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALIDADE));
  if (!blob) throw new Error('Não foi possível reduzir a foto');
  return { blob, w, h };
}

// Reduz e grava. Devolve a lista nova. Lança 'limite' se já houver 12.
export async function adicionarFoto(feiraId, arquivo) {
  const { blob, w, h } = await reduzir(arquivo);
  return transacao(feiraId, 'readwrite', (lista) => {
    if (lista.length >= MAX_FOTOS) throw new Error('limite');
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return [...lista, { id, blob, w, h, data: new Date().toISOString() }];
  });
}
