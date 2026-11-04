import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import {
  PRIORITIES, MAX_TASKS_PER_DAY, httpError, isISODate, cleanText, oneOf, dateField, idParam, addDays, serverToday
} from '../lib/validate.js';

export const tasksRouter = Router();
export const subtasksRouter = Router();

const MAX_SUBTASKS = 12;

function shape(t, subs) {
  return {
    id: String(t.id),
    title: t.title,
    priority: t.priority,
    date: t.due_date,
    created: t.created_on,
    done: !!t.done,
    doneOn: t.done_on,
    subtasks: subs.map((s) => ({ id: String(s.id), title: s.title, done: !!s.done }))
  };
}

async function loadTasks(db, userId, onlyId = null) {
  const [tasks] = await db.execute(
    `SELECT * FROM tasks WHERE user_id = ? AND deleted_at IS NULL ${onlyId ? 'AND id = ?' : ''} ORDER BY due_date, id`,
    onlyId ? [userId, onlyId] : [userId]);
  if (tasks.length === 0) return [];
  const [subs] = await db.query(
    'SELECT id, task_id, title, done FROM subtasks WHERE task_id IN (?) ORDER BY position, id', [tasks.map((t) => t.id)]);
  const byTask = new Map();
  for (const s of subs) (byTask.get(String(s.task_id)) || byTask.set(String(s.task_id), []).get(String(s.task_id))).push(s);
  return tasks.map((t) => shape(t, byTask.get(String(t.id)) || []));
}

/** Data fornita dal client accettata solo se vicina a oggi (±1 giorno, per i fusi orari); altrimenti si usa quella del server. */
function nearToday(value) {
  const today = serverToday();
  return isISODate(value) && value >= addDays(today, -1) && value <= addDays(today, 1) ? value : today;
}

/** Da usare dentro una transazione: il blocco sull'utente impedisce ad aggiunte contemporanee di superare il tetto. */
async function assertDayHasRoom(conn, userId, date) {
  await conn.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
  const [[{ n }]] = await conn.execute(
    'SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND deleted_at IS NULL AND due_date = ?', [userId, date]);
  if (Number(n) >= MAX_TASKS_PER_DAY) {
    throw httpError(409, `Giornata piena: massimo ${MAX_TASKS_PER_DAY} task al giorno. Scegli un'altra data.`);
  }
}

tasksRouter.get('/', async (req, res) => {
  res.json(await loadTasks(pool, req.user.id));
});

tasksRouter.post('/', async (req, res) => {
  const b = req.body || {};
  const title = cleanText(b.title, 'Titolo');
  const priority = oneOf(b.priority ?? 'media', PRIORITIES, 'Priorità');
  const date = dateField(b.date, 'Data');
  const created = nearToday(b.created);

  const rawSubs = b.subtasks ?? [];
  if (!Array.isArray(rawSubs) || rawSubs.length > MAX_SUBTASKS) throw httpError(400, `Massimo ${MAX_SUBTASKS} sotto-attività`);
  const subs = rawSubs.map((s) => cleanText(typeof s === 'string' ? s : s && s.title, 'Sotto-attività'));

  const id = await withTransaction(async (conn) => {
    await assertDayHasRoom(conn, req.user.id, date);
    const [r] = await conn.execute(
      'INSERT INTO tasks (user_id, title, priority, due_date, created_on) VALUES (?,?,?,?,?)',
      [req.user.id, title, priority, date, created]);
    for (let i = 0; i < subs.length; i++) {
      await conn.execute('INSERT INTO subtasks (task_id, title, position) VALUES (?,?,?)', [r.insertId, subs[i], i]);
    }
    return String(r.insertId);
  });
  const [task] = await loadTasks(pool, req.user.id, id);
  res.status(201).json(task);
});

tasksRouter.patch('/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const b = req.body || {};
  const sets = [];
  const args = [];

  const [rows] = await pool.execute('SELECT * FROM tasks WHERE id = ? AND user_id = ? AND deleted_at IS NULL', [id, req.user.id]);
  const current = rows[0];
  if (!current) throw httpError(404, 'Task non trovato');

  if ('title' in b) { sets.push('title = ?'); args.push(cleanText(b.title, 'Titolo')); }
  if ('priority' in b) { sets.push('priority = ?'); args.push(oneOf(b.priority, PRIORITIES, 'Priorità')); }
  if ('done' in b) {
    if (typeof b.done !== 'boolean') throw httpError(400, 'Valore "done" non valido');
    sets.push('done = ?', 'done_on = ?');
    args.push(b.done ? 1 : 0, b.done ? nearToday(b.doneOn) : null);
  }
  let newDate = null;
  if ('date' in b) {
    newDate = dateField(b.date, 'Data');
    if (newDate !== current.due_date) { sets.push('due_date = ?'); args.push(newDate); } else newDate = null;
  }
  if (sets.length === 0 && newDate === null) throw httpError(400, 'Nessuna modifica richiesta');

  await withTransaction(async (conn) => {
    if (newDate) await assertDayHasRoom(conn, req.user.id, newDate);
    if (sets.length) await conn.execute(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, [...args, id, req.user.id]);
    if (newDate) {
      await conn.execute(
        'INSERT INTO task_reschedules (task_id, user_id, action, from_date, to_date) VALUES (?,?,?,?,?)',
        [id, req.user.id, 'postponed', current.due_date, newDate]);
    }
  });
  const [task] = await loadTasks(pool, req.user.id, id);
  res.json(task);
});

tasksRouter.delete('/:id', async (req, res) => {
  const id = idParam(req.params.id);
  await withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      'SELECT due_date FROM tasks WHERE id = ? AND user_id = ? AND deleted_at IS NULL FOR UPDATE', [id, req.user.id]);
    if (!rows[0]) throw httpError(404, 'Task non trovato');
    await conn.execute('UPDATE tasks SET deleted_at = NOW() WHERE id = ?', [id]);
    await conn.execute(
      'INSERT INTO task_reschedules (task_id, user_id, action, from_date, to_date) VALUES (?,?,?,?,NULL)',
      [id, req.user.id, 'deleted', rows[0].due_date]);
  });
  res.status(204).end();
});

subtasksRouter.patch('/:id', async (req, res) => {
  const id = idParam(req.params.id);
  if (typeof (req.body || {}).done !== 'boolean') throw httpError(400, 'Valore "done" non valido');
  const [r] = await pool.execute(
    `UPDATE subtasks s JOIN tasks t ON t.id = s.task_id
        SET s.done = ? WHERE s.id = ? AND t.user_id = ? AND t.deleted_at IS NULL`,
    [req.body.done ? 1 : 0, id, req.user.id]);
  if (r.affectedRows === 0) throw httpError(404, 'Sotto-attività non trovata');
  res.json({ id, done: req.body.done });
});
