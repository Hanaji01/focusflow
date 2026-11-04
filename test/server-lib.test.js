import test from 'node:test';
import assert from 'node:assert/strict';
import { isISODate, cleanText, oneOf, idParam, addDays } from '../server/routes/lib/validate.js';
import { createLimiter } from '../server/routes/lib/limit.js';
import { addDaysISO, fromISO, toISO } from '../public/js/dates.js';

test('isISODate scarta le date impossibili', () => {
  assert.equal(isISODate('2026-02-28'), true);
  assert.equal(isISODate('2026-02-30'), false);
  assert.equal(isISODate('04/11/2026'), false);
  assert.equal(isISODate(20261104), false);
});

test('cleanText ripulisce e rifiuta i testi non validi', () => {
  assert.equal(cleanText('  due   parole ', 'Titolo'), 'due parole');
  assert.throws(() => cleanText('   ', 'Titolo'), { status: 400 });
  assert.throws(() => cleanText('x'.repeat(201), 'Titolo'), { status: 400 });
  assert.throws(() => cleanText(5, 'Titolo'), { status: 400 });
});

test('oneOf e idParam rifiutano i valori estranei', () => {
  assert.equal(oneOf('alta', ['alta', 'bassa'], 'Priorità'), 'alta');
  assert.throws(() => oneOf('altissima', ['alta'], 'Priorità'), { status: 400 });
  assert.equal(idParam('42'), '42');
  assert.throws(() => idParam('1; DROP TABLE tasks'), { status: 400 });
});

test('le date di server e client coincidono, anche a cavallo di mese e anno', () => {
  for (const [iso, n] of [['2026-01-31', 1], ['2026-12-31', 1], ['2028-02-28', 1], ['2026-03-01', -1]]) {
    assert.equal(addDays(iso, n), addDaysISO(iso, n));
  }
  assert.equal(toISO(fromISO('2026-11-04')), '2026-11-04');
});

test('il limitatore blocca oltre il massimo e si azzera', () => {
  const limit = createLimiter(60000, 2);
  limit.hit('a');
  assert.equal(limit.blocked('a'), false);
  limit.hit('a');
  assert.equal(limit.blocked('a'), true);
  assert.equal(limit.blocked('b'), false);
  limit.reset('a');
  assert.equal(limit.blocked('a'), false);
});

test('il limitatore dimentica dopo la finestra', async () => {
  const limit = createLimiter(20, 1);
  limit.hit('a');
  assert.equal(limit.blocked('a'), true);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(limit.blocked('a'), false);
});
