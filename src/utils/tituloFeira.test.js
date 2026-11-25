import assert from 'node:assert/strict';
import test from 'node:test';
import { registrarFeiras, tituloDaFeira } from './tituloFeira.js';

const duquesa = { id: '48', bairro: 'Grajaú', address: 'Rua Duquesa de Bragança' };
const mearim = { id: '49', bairro: 'Grajaú', address: 'Rua Mearim' };
const julio = { id: '50', bairro: 'Grajaú', address: 'Av. Julio Furtado' };
const catumbi = { id: '5', bairro: 'Catumbi', address: 'Rua Emília Guimarães' };
const grajau = [duquesa, mearim, julio, catumbi];

test('usa o título de TRECHOS_INFO antes do separador quando existir', () => {
  assert.equal(tituloDaFeira(mearim, grajau), 'Feira da Mearim');
  assert.equal(tituloDaFeira({ ...mearim, id: 49 }, [mearim]), 'Feira da Mearim');
});

test('inclui o endereço quando o bairro tem mais de uma feira na lista', () => {
  assert.equal(tituloDaFeira(duquesa, grajau), 'Feira Grajaú · Rua Duquesa de Bragança');
  assert.equal(tituloDaFeira(julio, grajau), 'Feira Grajaú · Av. Julio Furtado');
});

test('usa apenas Feira e bairro quando o bairro tem uma única feira ou sem endereço', () => {
  assert.equal(tituloDaFeira(catumbi, grajau), 'Feira Catumbi');
  assert.equal(tituloDaFeira({ id: '999', bairro: 'Grajaú', address: '' }, grajau), 'Feira Grajaú');
  assert.equal(tituloDaFeira(null, grajau), '');
});

test('cache do módulo resolve bairros da base e atualiza com registrarFeiras sem duplicar ids', () => {
  assert.equal(tituloDaFeira(julio), 'Feira Grajaú · Av. Julio Furtado');
  assert.equal(tituloDaFeira(catumbi), 'Feira Catumbi');

  const unica = { id: 'teste-unico-1', bairro: 'Bairro Teste Único', address: 'Rua Alfa' };
  registrarFeiras([unica, unica]);
  assert.equal(tituloDaFeira(unica), 'Feira Bairro Teste Único');

  const parA = { id: 'teste-duplo-1', bairro: 'Bairro Teste Duplo', address: 'Rua Um' };
  const parB = { id: 'teste-duplo-2', bairro: 'Bairro Teste Duplo', address: 'Rua Dois' };
  registrarFeiras([parA, parB]);
  assert.equal(tituloDaFeira(parA), 'Feira Bairro Teste Duplo · Rua Um');
  assert.equal(tituloDaFeira(parB), 'Feira Bairro Teste Duplo · Rua Dois');
});
