import assert from 'node:assert/strict';
import test from 'node:test';
import { diasParaTerminar } from './diasTermino.js';

test('proposta criada há pouco termina em 14 dias', () => {
  const agora = new Date(2026, 10, 11, 10, 0);
  const expiraEm = new Date(2026, 10, 25, 10, 1).toISOString();
  assert.equal(diasParaTerminar({ expiraEm }, agora), 14);
});

test('último dia, singular e prazo vencido', () => {
  const expiraEm = new Date(2026, 10, 25, 10, 0).toISOString();
  assert.equal(diasParaTerminar({ expiraEm }, new Date(2026, 10, 24, 23, 0)), 1);
  assert.equal(diasParaTerminar({ expiraEm }, new Date(2026, 10, 25, 8, 0)), 0);
  assert.equal(diasParaTerminar({ expiraEm }, new Date(2026, 10, 26, 8, 0)), 0);
});
