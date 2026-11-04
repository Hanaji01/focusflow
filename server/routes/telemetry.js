import { Router } from 'express';
import { pool } from '../database/db.js';
import { httpError } from './lib/validate.js';

const router = Router();
const METRIC = /^[a-z][a-z0-9_]{1,39}$/;
const KEEP_DAYS = 90;

/** Le misure tecniche servono solo per un periodo: quelle più vecchie vengono cancellate. */
export async function pruneTelemetry() {
  await pool.execute('DELETE FROM telemetry_logs WHERE created_at < NOW() - INTERVAL ? DAY', [KEEP_DAYS]);
}

router.post('/', async (req, res) => {
  const events = (req.body || {}).events;
  if (!Array.isArray(events) || events.length === 0 || events.length > 50) throw httpError(400, 'Da 1 a 50 eventi per richiesta');

  const rows = [];
  for (const e of events) {
    if (!e || typeof e.metric !== 'string' || !METRIC.test(e.metric)) throw httpError(400, 'Nome della metrica non valido');
    const value = e.value === undefined || e.value === null ? null : Number(e.value);
    if (value !== null && !Number.isFinite(value)) throw httpError(400, 'Valore non numerico');
    let meta = null;
    if (e.meta !== undefined && e.meta !== null) {
      meta = JSON.stringify(e.meta);
      if (meta.length > 2000) throw httpError(400, 'Metadati troppo lunghi');
    }
    rows.push([req.user.id, e.metric, value, meta]);
  }
  await pool.query('INSERT INTO telemetry_logs (user_id, metric, value, meta) VALUES ?', [rows]);
  res.status(201).json({ saved: rows.length });
});

export default router;
