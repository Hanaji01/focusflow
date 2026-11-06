import 'dotenv/config';
import mysql from 'mysql2/promise';

// Toglie spazi e a capo finiti nei valori copiati e incollati
const env = (name) => process.env[name]?.trim();

export const dbConfig = {
  host: env('DB_HOST') || '127.0.0.1',
  port: Number(env('DB_PORT') || 3306),
  user: env('DB_USER'),
  password: env('DB_PASSWORD'),
  database: env('DB_NAME'),
  // Database online: certificato del servizio, per una connessione cifrata e verificata
  ssl: process.env.DB_CA ? { ca: process.env.DB_CA.split('\\n').join('\n') } : undefined,
  charset: 'utf8mb4',
  dateStrings: true,        // le colonne DATE arrivano come 'YYYY-MM-DD', senza conversioni di fuso orario
  waitForConnections: true,
  connectionLimit: 10
};

export const pool = mysql.createPool(dbConfig);

/** Esegue fn(conn) dentro una transazione; in caso di errore annulla tutto. */
export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}
