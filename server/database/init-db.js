import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { dbConfig } from './db.js';

const sql = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql'), 'utf8');

if (!dbConfig.user || !dbConfig.database) {
  console.error('Imposta DB_USER e DB_NAME nel file .env');
  process.exit(1);
}

const conn = await mysql.createConnection({ ...dbConfig, multipleStatements: true });
try {
  await conn.query(sql);
  const [tables] = await conn.query('SHOW TABLES');
  console.log(`Database "${dbConfig.database}" pronto: ${tables.length} tabelle.`);
} catch (err) {
  console.error('Impossibile creare le tabelle:', err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
