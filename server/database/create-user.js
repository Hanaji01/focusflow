// Uso: npm run user:create -- <utente> <password>
import bcrypt from 'bcryptjs';
import { pool } from './db.js';

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error('Uso: npm run user:create -- <utente> <password>');
  process.exit(1);
}
if (!/^[A-Za-z0-9_.-]{3,40}$/.test(username) || password.length < 8 || Buffer.byteLength(password) > 72) {
  console.error('Utente: 3–40 caratteri (lettere, numeri, . _ -). Password: da 8 a 72 caratteri.');
  process.exit(1);
}
try {
  await pool.execute('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, await bcrypt.hash(password, 10)]);
  console.log(`Utente "${username}" creato.`);
} catch (err) {
  console.error(err.code === 'ER_DUP_ENTRY' ? 'Esiste già un utente con questo nome.' : err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
