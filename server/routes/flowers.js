import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { httpError, dateField, addDays, serverToday } from '../lib/validate.js';

const router = Router();

function shape(f, justDelivered = false) {
  return {
    date: f.flower_date,
    kind: f.kind,
    petalsTotal: f.petals_total,
    petalsCompleted: f.petals_completed,
    bonusPetals: f.bonus_petals,
    delivered: !!f.delivered_by_cat,
    justDelivered
  };
}

router.get('/', async (req, res) => {
  const from = dateField(req.query.from ?? '1970-01-01', 'Data iniziale');
  const to = dateField(req.query.to ?? '2999-12-31', 'Data finale');
  const [rows] = await pool.execute(
    'SELECT * FROM flowers WHERE user_id = ? AND flower_date BETWEEN ? AND ? ORDER BY flower_date', [req.user.id, from, to]);
  res.json(rows.map((f) => shape(f)));
});

/**
 * Ricalcola il fiore di una giornata dai task. Si può fare solo per oggi (±1 giorno, per i fusi orari):
 * le giornate passate sono "chiuse" e non cambiano più.
 * Body opzionale: { rest: true | false } per segnare/togliere la giornata di pausa.
 */
router.put('/:date/sync', async (req, res) => {
  const date = dateField(req.params.date, 'Data');
  const today = serverToday();
  if (date < addDays(today, -1)) throw httpError(409, 'Giornata chiusa: il fiore non si può più modificare');
  if (date > addDays(today, 1)) throw httpError(400, 'Non si può calcolare il fiore di un giorno futuro');
  const rest = (req.body || {}).rest;
  if (rest !== undefined && typeof rest !== 'boolean') throw httpError(400, 'Valore "rest" non valido');

  const result = await withTransaction(async (conn) => {
    // Crea la riga se manca e la blocca: due sincronizzazioni contemporanee non possono consegnare il fiore due volte
    await conn.execute('INSERT IGNORE INTO flowers (user_id, flower_date) VALUES (?, ?)', [req.user.id, date]);
    const [[flower]] = await conn.execute(
      'SELECT * FROM flowers WHERE user_id = ? AND flower_date = ? FOR UPDATE', [req.user.id, date]);

    // Un petalo per ogni task completato quel giorno; restano da fare i task con quella data.
    // Una scadenza lontana non pesa sui giorni precedenti: conta solo nella sua data o quando viene completata.
    const [due] = await conn.execute(
      `SELECT task_type, due_date, done, done_on FROM tasks
        WHERE user_id = ? AND deleted_at IS NULL AND (
          (done = 1 AND done_on = ?) OR (done = 0 AND due_date = ?))`,
      [req.user.id, date, date]);

    const total = due.length;
    const completed = due.filter((t) => t.done).length;
    // Petali bonus: scadenze completate in questo giorno prima della data di scadenza
    const bonus = due.filter((t) => t.task_type === 'scadenza' && t.done && t.done_on === date && t.due_date > date).length;

    const kind = rest === undefined ? flower.kind : (rest ? 'rest' : 'normal');
    const complete = kind === 'normal' && total > 0 && completed === total;
    const justDelivered = complete && !flower.delivered_by_cat;

    await conn.execute(
      `UPDATE flowers SET kind = ?, petals_total = ?, petals_completed = ?, bonus_petals = ?,
              delivered_by_cat = ? WHERE id = ?`,
      [kind, total, completed, bonus, flower.delivered_by_cat || justDelivered ? 1 : 0, flower.id]);

    const [[fresh]] = await conn.execute('SELECT * FROM flowers WHERE id = ?', [flower.id]);
    return shape(fresh, justDelivered);
  });
  res.json(result);
});

export default router;
