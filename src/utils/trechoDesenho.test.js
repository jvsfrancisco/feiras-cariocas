import assert from 'node:assert/strict';
import test from 'node:test';
import { analisarTrechoDesenhado } from './trechoDesenho.js';
import { dentroDoHorarioDaFeira } from './confirmacoes.js';

const feira = { lat: -22.9, lng: -43.2, day: 'Quarta-Feira', hours: '08:00–12:00' };
const erro = (pontos) => analisarTrechoDesenhado(pontos, feira).erro;

test('trecho válido entre 30 e 800 m, perto da feira', () => {
  const resultado = analisarTrechoDesenhado([[-22.9, -43.2], [-22.8995, -43.2]], feira);
  assert.equal(resultado.erro, null);
  assert.ok(resultado.comprimento > 30 && resultado.comprimento < 800);
});

test('contagem, comprimento e distância ao ponto original bloqueiam Continuar', () => {
  assert.equal(erro([[-22.9, -43.2]]), 'Marque pelo menos o começo e o fim');
  assert.equal(erro(Array.from({ length: 13 }, (_, i) => [-22.9 + i * 0.00001, -43.2])), 'No máximo 12 pontos');
  assert.equal(erro([[-22.9, -43.2], [-22.89995, -43.2]]), 'Trecho curto demais');
  assert.equal(erro([[-22.9, -43.2045], [-22.9, -43.1955]]), 'Trecho longo demais');
  assert.equal(erro([[-22.9, -43.2], [-22.8935, -43.2]]), 'Esse ponto está longe demais da feira');
});

test('pontos repetidos, trecho fechado e autointerseção são recusados', () => {
  assert.equal(erro([[-22.9, -43.2], [-22.9, -43.2]]), 'Marque um ponto diferente do anterior');
  assert.equal(erro([[-22.9, -43.2], [-22.899, -43.2], [-22.9, -43.2]]), 'O começo e o fim precisam ser diferentes');
  assert.equal(erro([[-22.9, -43.2], [-22.899, -43.199], [-22.899, -43.2], [-22.9, -43.199]]), 'O trecho não pode cruzar a si mesmo');
});

test('janela de uma hora usa o dia e o relógio de São Paulo', () => {
  assert.equal(dentroDoHorarioDaFeira(feira, new Date('2026-11-11T10:00:00Z')), true);
  assert.equal(dentroDoHorarioDaFeira(feira, new Date('2026-11-11T09:59:00Z')), false);
  assert.equal(dentroDoHorarioDaFeira(feira, new Date('2026-11-11T16:00:00Z')), true);
  assert.equal(dentroDoHorarioDaFeira(feira, new Date('2026-11-11T16:01:00Z')), false);
  assert.equal(dentroDoHorarioDaFeira(feira, new Date('2026-11-12T10:00:00Z')), false);
});
