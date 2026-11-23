import test from 'node:test';
import assert from 'node:assert/strict';
import { acharDuplicada } from './duplicadas.js';

const nova = { day: 'Terça-Feira', lat: -22.915, lng: -43.258 };
const existente = { id: '49', day: 'Terça-Feira', lat: -22.9155, lng: -43.258 };

test('acha feira do mesmo dia a menos de 150 m', () => {
  assert.equal(acharDuplicada(nova, [existente]), existente);
});

test('ignora feira de outro dia', () => {
  assert.equal(acharDuplicada(nova, [{ ...existente, day: 'Quarta-Feira' }]), null);
});

test('ignora feira distante', () => {
  assert.equal(acharDuplicada(nova, [{ ...existente, lat: -22.925 }]), null);
});

test('acha feira perto do trecho mesmo longe do pino', () => {
  const comTrecho = {
    ...existente, lat: -22.925,
    trecho: [[-22.914, -43.258], [-22.916, -43.258]],
  };
  assert.equal(acharDuplicada(nova, [comTrecho]), comTrecho);
});

test('ignora feira sem coordenadas', () => {
  assert.equal(acharDuplicada(nova, [{ ...existente, lat: null, lng: null,
    trecho: [[-22.914, -43.258], [-22.916, -43.258]] }]), null);
});
