import test from 'node:test';
import assert from 'node:assert/strict';
import { dimensoesParaLado, escolherJpeg, QUALIDADES_JPEG } from './comprimirFoto.js';

test('escolhe a primeira qualidade JPEG que cabe no limite', async () => {
  const usadas = [];
  const resultado = await escolherJpeg(async (qualidade) => {
    usadas.push(qualidade);
    return { type: 'image/jpeg', size: qualidade >= 0.72 ? 310 * 1024 : 299 * 1024 };
  }, 300 * 1024);
  assert.equal(resultado.qualidade, 0.62);
  assert.deepEqual(usadas, QUALIDADES_JPEG.slice(0, 3));
});

test('recusa JPEG grande mesmo na menor qualidade e blobs de outro tipo', async () => {
  assert.equal(await escolherJpeg(async () => ({ type: 'image/jpeg', size: 301 * 1024 }), 300 * 1024), null);
  assert.equal(await escolherJpeg(async () => ({ type: 'image/png', size: 20 * 1024 }), 40 * 1024), null);
});

test('aplica o limite de 40 KB à miniatura', async () => {
  const resultado = await escolherJpeg(async (qualidade) => ({
    type: 'image/jpeg', size: qualidade > 0.42 ? 41 * 1024 : 39 * 1024,
  }), 40 * 1024);
  assert.equal(resultado.qualidade, 0.42);
  assert.ok(resultado.blob.size <= 40 * 1024);
});

test('limita o lado maior a 1600 px e a miniatura a 320 px sem ampliar imagens pequenas', () => {
  assert.deepEqual(dimensoesParaLado(4000, 3000, 1600), { largura: 1600, altura: 1200 });
  assert.deepEqual(dimensoesParaLado(3000, 4000, 320), { largura: 240, altura: 320 });
  assert.deepEqual(dimensoesParaLado(200, 100, 320), { largura: 200, altura: 100 });
});
