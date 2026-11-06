// Uso: npm run user:password -- <utente>
// La nuova password si scrive al prompt: non compare a schermo e non resta nella cronologia dei comandi.
import bcrypt from 'bcryptjs';
import { pool } from './db.js';

function readPassword(label) {
  process.stdout.write(label);
  const { stdin } = process;
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  return new Promise((resolve) => {
    let value = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\u0003') { process.stdout.write('\n'); process.exit(130); }   // Ctrl+C
        if (ch === '\u007f' || ch === '\b') { value = value.slice(0, -1); continue; }
        if (ch === '\r' || ch === '\n') {
          if (stdin.isTTY) stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

const [username] = process.argv.slice(2);
if (!username) {
  console.error('Uso: npm run user:password -- <utente>');
  process.exit(1);
}
try {
  const [rows] = await pool.execute('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
  if (!rows[0]) {
    console.error(`Non esiste un utente "${username}".`);
    process.exitCode = 1;
  } else {
    const password = await readPassword('Nuova password (almeno 8 caratteri, non si vede mentre scrivi): ');
    if (password.length < 8 || Buffer.byteLength(password) > 72) {
      console.error('La password deve avere da 8 a 72 caratteri. Non ho cambiato nulla.');
      process.exitCode = 1;
    } else {
      await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(password, 10), rows[0].id]);
      console.log(`Password di "${username}" cambiata.`);
    }
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
