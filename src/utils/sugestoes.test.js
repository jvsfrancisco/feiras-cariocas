import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptarSugestao, encontrarDuplicada, diaAtualSaoPaulo, diaNumero } from './sugestoes.js';
import { dentroDoHorarioDaFeira } from './confirmacoes.js';

test('adapta sugestão privada para o cartão sem confundir com feira ativa', () => {
  const feira = adaptarSugestao({ id: 'abc', nome: 'Feira da Praça', endereco: 'Rua A', bairro: 'Centro', dia: 5, inicio: '07:00:00', fim: '13:00:00', lat: -22.9, lng: -43.2 }, true);
  assert.equal(feira.id, 'abc');
  assert.equal(feira.day, 'Sexta-Feira');
  assert.equal(feira.hours, '07:00–13:00');
  assert.equal(feira.sugestao, 'minha');
  assert.equal(feira.nome, 'Feira da Praça');
});

test('encontra duplicata próxima no mesmo dia', () => {
  const feiras = [{ id: 'a', day: 'Sexta-Feira', lat: -22.9, lng: -43.2 }, { id: 'b', day: 'Sábado', lat: -22.9, lng: -43.2 }];
  assert.equal(encontrarDuplicada(feiras, 'Sexta-Feira', { lat: -22.9, lng: -43.2 })?.id, 'a');
  assert.equal(encontrarDuplicada(feiras, 'Domingo', { lat: -22.9, lng: -43.2 }), null);
  assert.equal(diaNumero('Sexta-Feira'), 5);
});

test('dia padrão segue São Paulo quando o UTC já virou', () => {
  assert.equal(diaAtualSaoPaulo(new Date('2026-11-13T02:30:00Z')), 'Quinta-Feira');
  assert.equal(diaAtualSaoPaulo(new Date('2026-11-13T03:30:00Z')), 'Sexta-Feira');
});

test('elegibilidade de horário exige o dia certo e aceita uma hora de margem', () => {
  const feira = { day: 'Quinta-Feira', hours: '07:00–13:00' };
  assert.equal(dentroDoHorarioDaFeira(feira, new Date('2026-11-12T09:30:00Z')), true);
  assert.equal(dentroDoHorarioDaFeira(feira, new Date('2026-11-12T08:59:00Z')), false);
  assert.equal(dentroDoHorarioDaFeira(feira, new Date('2026-11-12T17:01:00Z')), false);
  assert.equal(dentroDoHorarioDaFeira({ ...feira, day: 'Sexta-Feira' }, new Date('2026-11-12T12:00:00Z')), false);
});
