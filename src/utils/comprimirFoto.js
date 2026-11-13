export const QUALIDADES_JPEG = [0.82, 0.72, 0.62, 0.52, 0.42, 0.32, 0.22];

// A escolha é pura em relação ao canvas: gerar recebe a qualidade e devolve um Blob.
export async function escolherJpeg(gerar, limite, qualidades = QUALIDADES_JPEG) {
  for (const qualidade of qualidades) {
    const blob = await gerar(qualidade);
    if (blob?.type === 'image/jpeg' && blob.size <= limite) return { blob, qualidade };
  }
  return null;
}

export function dimensoesParaLado(largura, altura, lado) {
  const escala = Math.min(1, lado / Math.max(largura, altura));
  return {
    largura: Math.max(1, Math.round(largura * escala)),
    altura: Math.max(1, Math.round(altura * escala)),
  };
}

function carregarImagem(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const imagem = new Image();
    imagem.onload = () => { URL.revokeObjectURL(url); resolve(imagem); };
    imagem.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagem inválida')); };
    imagem.src = url;
  });
}

async function origemOrientada(arquivo) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(arquivo, { imageOrientation: 'from-image' }); }
    catch { /* usa o decodificador do navegador */ }
  }
  return carregarImagem(arquivo);
}

function canvasDe(origem, lado) {
  const largura = origem.naturalWidth || origem.width;
  const altura = origem.naturalHeight || origem.height;
  const dimensoes = dimensoesParaLado(largura, altura, lado);
  const canvas = document.createElement('canvas');
  canvas.width = dimensoes.largura;
  canvas.height = dimensoes.altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível');
  ctx.fillStyle = '#FFFBF0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(origem, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function gerarJpeg(canvas, qualidade) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', qualidade));
}

async function comprimir(origem, lado, limite) {
  let tamanho = lado;
  for (let tentativa = 0; tentativa < 8; tentativa += 1) {
    const canvas = canvasDe(origem, tamanho);
    const escolhido = await escolherJpeg((qualidade) => gerarJpeg(canvas, qualidade), limite);
    if (escolhido) return escolhido.blob;
    tamanho = Math.round(tamanho * 0.8);
  }
  throw new Error('Não foi possível reduzir a foto');
}

export async function prepararFoto(arquivo) {
  const origem = await origemOrientada(arquivo);
  try {
    const foto = await comprimir(origem, 1600, 300 * 1024);
    const miniatura = await comprimir(origem, 320, 40 * 1024);
    return { foto, miniatura };
  } finally {
    if (typeof origem.close === 'function') origem.close();
  }
}
