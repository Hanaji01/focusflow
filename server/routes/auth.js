import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { httpError } from '../lib/validate.js';
import { createLimiter } from '../lib/limit.js';

const router = Router();
const COST = 10;
// Hash fittizio: se l'utente non esiste si confronta comunque, così il tempo di risposta non rivela quali utenti esistono
const DUMMY_HASH = bcrypt.hashSync('password-fittizia', COST);

const MINUTE = 60 * 1000;
const loginByUser = createLimiter(15 * MINUTE, 10);    // tentativi falliti per coppia ip|utente
const loginByIp = createLimiter(15 * MINUTE, 50);      // tentativi falliti per ip, su qualunque utente
const registerByIp = createLimiter(60 * MINUTE, 10);   // ogni registrazione costa un hash bcrypt
const passwordByUser = createLimiter(15 * MINUTE, 10); // conferme della password dall'area account

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw httpError(500, 'Configurazione del server non valida');
  return s;
}

/** Impronta della password nel token: cambiando la password, i token già emessi smettono di valere. */
function passwordStamp(hash) {
  return crypto.createHmac('sha256', secret()).update(hash).digest('base64url').slice(0, 16);
}

function sign(user) {
  return jwt.sign(
    { sub: String(user.id), name: user.username, pv: passwordStamp(user.password_hash) },
    secret(),
    { algorithm: 'HS256', expiresIn: '7d' });
}

const session = (user) => ({ token: sign(user), user: { id: user.id, username: user.username } });

/** Middleware: richiede un token valido di un utente esistente e imposta req.user = { id, username } */
export async function requireAuth(req, _res, next) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return next(httpError(401, 'Accesso richiesto'));
  let payload;
  try {
    payload = jwt.verify(m[1], secret(), { algorithms: ['HS256'] });   // 'none' e altri algoritmi vengono rifiutati
  } catch (e) {
    return next(e.status ? e : httpError(401, 'Sessione non valida o scaduta'));
  }
  const [rows] = await pool.execute('SELECT id, username, password_hash FROM users WHERE id = ? LIMIT 1', [payload.sub]);
  const user = rows[0];
  if (!user || passwordStamp(user.password_hash) !== payload.pv) return next(httpError(401, 'Sessione non valida o scaduta'));
  req.user = { id: user.id, username: user.username };
  next();
}

function readCredentials(body) {
  const { username, password } = body || {};
  if (typeof username !== 'string' || typeof password !== 'string') throw httpError(400, 'Utente e password obbligatori');
  return { username: username.trim(), password };
}

function checkNewPassword(password) {
  if (typeof password !== 'string' || password.length < 8) throw httpError(400, 'La password deve avere almeno 8 caratteri');
  if (Buffer.byteLength(password) > 72) throw httpError(400, 'La password è troppo lunga (massimo 72 byte)');
}

/** Conferma la password dell'utente collegato. Risponde 403, non 401: l'errore non deve chiudere la sessione. */
async function confirmPassword(userId, password) {
  const key = String(userId);
  if (passwordByUser.blocked(key)) throw httpError(429, 'Troppi tentativi: riprova tra qualche minuto');
  const [rows] = await pool.execute('SELECT id, username, password_hash FROM users WHERE id = ? LIMIT 1', [userId]);
  const ok = typeof password === 'string' && rows[0] && await bcrypt.compare(password.slice(0, 200), rows[0].password_hash);
  if (!ok) { passwordByUser.hit(key); throw httpError(403, 'Password attuale errata'); }
  passwordByUser.reset(key);
  return rows[0];
}

router.post('/register', async (req, res) => {
  if (String(process.env.ALLOW_REGISTER).toLowerCase() === 'false') throw httpError(403, 'Le registrazioni sono chiuse');
  if (registerByIp.blocked(req.ip)) throw httpError(429, 'Troppe registrazioni: riprova più tardi');
  registerByIp.hit(req.ip);

  const { username, password } = readCredentials(req.body);
  if (!/^[A-Za-z0-9_.-]{3,40}$/.test(username)) throw httpError(400, 'L\'utente deve avere 3–40 caratteri (lettere, numeri, . _ -)');
  checkNewPassword(password);

  const hash = await bcrypt.hash(password, COST);
  try {
    const [r] = await pool.execute('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash]);
    res.status(201).json(session({ id: r.insertId, username, password_hash: hash }));
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw httpError(409, 'Questo nome utente è già in uso');
    throw e;
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = readCredentials(req.body);
  const name = username.slice(0, 40).toLowerCase();
  const pair = `${req.ip}|${name}`;
  if (loginByIp.blocked(req.ip) || loginByUser.blocked(pair)) throw httpError(429, 'Troppi tentativi: riprova tra qualche minuto');

  const [rows] = await pool.execute('SELECT id, username, password_hash FROM users WHERE username = ? LIMIT 1', [username.slice(0, 40)]);
  const user = rows[0];
  const ok = await bcrypt.compare(password.slice(0, 200), user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    loginByUser.hit(pair);
    loginByIp.hit(req.ip);
    throw httpError(401, 'Utente o password errati');
  }

  loginByUser.reset(pair);
  res.json(session(user));
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

/* Cambia la password: le altre sessioni si chiudono, questa riceve un token nuovo */
router.post('/password', requireAuth, async (req, res) => {
  const { current, next } = req.body || {};
  checkNewPassword(next);
  const user = await confirmPassword(req.user.id, current);
  const hash = await bcrypt.hash(next, COST);
  await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);
  res.json(session({ ...user, password_hash: hash }));
});

/* Elimina l'account: task, fiori e telemetria spariscono con lui (ON DELETE CASCADE) */
router.delete('/account', requireAuth, async (req, res) => {
  const user = await confirmPassword(req.user.id, (req.body || {}).password);
  await pool.execute('DELETE FROM users WHERE id = ?', [user.id]);
  res.status(204).end();
});

export default router;
