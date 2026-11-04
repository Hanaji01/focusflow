import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { pool } from './db.js';
import authRouter, { requireAuth } from './routes/auth.js';
import { tasksRouter, subtasksRouter } from './routes/tasks.js';
import flowersRouter from './routes/flowers.js';
import telemetryRouter from './routes/telemetry.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET mancante o troppo corto (servono almeno 32 caratteri). Controlla il file .env');
  process.exit(1);
}

const app = express();
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

// Librerie da CDN, font e modello AI (Hugging Face rimanda i file verso altri domini hf.co)
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data:",
  "connect-src 'self' https://cdn.jsdelivr.net https://huggingface.co https://*.huggingface.co https://*.hf.co",
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'"
].join('; ');

app.disable('x-powered-by');
// Dietro un proxy (nginx, Render…): numero di proxy davanti al server, per leggere l'IP vero dei client
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY));
app.use(express.json({ limit: '100kb' }));
app.use((_req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': CSP });
  next();
});

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false, error: 'Database non raggiungibile' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/tasks', requireAuth, tasksRouter);
app.use('/api/subtasks', requireAuth, subtasksRouter);
app.use('/api/flowers', requireAuth, flowersRouter);
app.use('/api/telemetry', requireAuth, telemetryRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Percorso non trovato' }));

app.get('/', (_req, res) => res.redirect('/login.html'));
app.use(express.static(publicDir));

// Gestione errori: i dettagli interni non escono mai verso il client
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON non valido' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Richiesta troppo grande' });
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Errore interno del server' : err.message });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`FocusFlow in ascolto su http://localhost:${port}`));
