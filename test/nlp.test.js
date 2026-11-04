import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, segmentHeuristic, classifyPriority, __setChronoForTests } from '../public/js/nlp.js';
import { addDaysISO, todayISO } from '../public/js/dates.js';

__setChronoForTests(null);   // solo le regole: niente rete e niente modello
const tomorrow = addDaysISO(todayISO(), 1);

test('divide le frasi dove inizia una nuova azione', () => {
  assert.deepEqual(segmentHeuristic('finire la relazione e chiamare il relatore'), ['finire la relazione', 'chiamare il relatore']);
});

test('non divide gli elenchi di cose', () => {
  assert.equal(segmentHeuristic('Comprare frutta e verdura').length, 1);
  assert.equal(segmentHeuristic('Comprare pane, latte e pere').length, 1);
});

test('la data vale anche per i task seguenti', async () => {
  const tasks = await analyze('Domani finire la relazione e chiamare il relatore');
  assert.deepEqual(tasks.map((t) => t.date), [tomorrow, tomorrow]);
});

test('la priorità in apertura vale per tutti i task', async () => {
  const tasks = await analyze('Urgente: pagare la bolletta e chiamare il tecnico');
  assert.deepEqual(tasks.map((t) => t.priority), ['alta', 'alta']);
});

test('la priorità detta a metà vale solo per il suo task', async () => {
  const tasks = await analyze('Pagare la bolletta urgente e chiamare il tecnico');
  assert.deepEqual(tasks.map((t) => t.priority), ['alta', 'media']);
});

test('riconosce priorità alte, basse e negate', () => {
  assert.equal(classifyPriority('consegna importante'), 'alta');
  assert.equal(classifyPriority('quando ho tempo'), 'bassa');
  assert.equal(classifyPriority('non è importante'), 'bassa');
  assert.equal(classifyPriority('fare la spesa'), 'media');
});

test('il titolo perde data, priorità e formule iniziali', async () => {
  const [task] = await analyze('Devo chiamare il dentista domani, urgente');
  assert.equal(task.title, 'Chiamare il dentista');
  assert.equal(task.date, tomorrow);
});

test('senza consenso il modello non parte', async () => {
  const lunga = 'Finire la relazione per il capo e chiamare il relatore questa settimana quando ho un po di tempo libero';
  const tasks = await analyze(lunga);
  assert.equal(tasks.length, 2);
  const { getStatus } = await import('../public/js/nlp.js');
  assert.equal(getStatus().state, 'off');
});
