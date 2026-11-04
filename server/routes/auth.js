import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { httpError } from '../lib/validate.js';

const router = Router();
const COST = 10;
// Hash fittizio: se l'utente non esiste si confronta comunque, così il tempo di risposta non rivela quali utenti esistono
const DUMMY_HASH = bcrypt.hashSync('password-fittizia', COST);

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw httpError(500, 'Configurazione del server non valida');
  return s;
}

function sign(user) {
  return jwt.sign({ sub: String(user.id), name: user.username }, secret(), { algorithm: 'HS256', expiresIn: '7d' });
}

/** Middleware: richiede un token valido e imposta req.user = { id, username } */
export function requireAuth(req, _res, next) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return next(httpError(401, 'Accesso richiesto'));
  try {
    const p = jwt.verify(m[1], secret(), { algorithms: ['HS256'] });   // 'none' e altri algoritmi vengono rifiutati
    req.user = { id: Number(p.sub), username: p.name };
    next();
  } catch (e) {
    next(e.status ? e : httpError(401, 'Sessione non valida o scaduta'));
  }
}

/* Limite ai tentativi di accesso: 10 ogni 15 minuti per coppia ip|utente */
const attempts = new Map();
const WINDOW = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
function throttleKey(req, username) { return `${req.ip}|${String(username).toLowerCase()}`; }
function isBlocked(key) {
  const a = attempts.get(key);
  if (!a) return false;
  if (Date.now() - a.first > WINDOW) { attempts.delete(key); return false; }
  return a.count >= MAX_ATTEMPTS;
}
function fail(key) {
  const a = attempts.get(key);
  if (!a || Date.now() - a.first > WINDOW) attempts.set(key, { count: 1, first: Date.now() });
  else a.count++;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, a] of attempts) if (now - a.first > WINDOW) attempts.delete(k);
}, WINDOW).unref();

function readCredentials(body) {
  const { username, password } = body || {};
  if (typeof username !== 'string' || typeof password !== 'string') throw httpError(400, 'Utente e password obbligatori');
  return { username: username.trim(), password };
}

router.post('/register', async (req, res) => {
  if (String(process.env.ALLOW_REGISTER).toLowerCase() === 'false') throw httpError(403, 'Le registrazioni sono chiuse');
  const { username, password } = readCredentials(req.body);
  if (!/^[A-Za-z0-9_.-]{3,40}$/.test(username)) throw httpError(400, 'L\'utente deve avere 3–40 caratteri (lettere, numeri, . _ -)');
  if (password.length < 8) throw httpError(400, 'La password deve avere almeno 8 caratteri');
  if (Buffer.byteLength(password) > 72) throw httpError(400, 'La password è troppo lunga (massimo 72 byte)');

  const hash = await bcrypt.hash(password, COST);
  try {
    const [r] = await pool.execute('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash]);
    const user = { id: r.insertId, username };
    res.status(201).json({ token: sign(user), user: { id: user.id, username } });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw httpError(409, 'Questo nome utente è già in uso');
    throw e;
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = readCredentials(req.body);
  const key = throttleKey(req, username);
  if (isBlocked(key)) throw httpError(429, 'Troppi tentativi: riprova tra qualche minuto');

  const [rows] = await pool.execute('SELECT id, username, password_hash FROM users WHERE username = ? LIMIT 1', [username]);
  const user = rows[0];
  const ok = await bcrypt.compare(password.slice(0, 200), user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) { fail(key); throw httpError(401, 'Utente o password errati'); }

  attempts.delete(key);
  res.json({ token: sign(user), user: { id: user.id, username: user.username } });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

export default router;
