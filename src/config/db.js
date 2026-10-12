import mysql from 'mysql2/promise';
import { config } from './env.js';

let pool;

export const getPool = () => {
  if (!pool) {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      waitForConnections: true,
      connectionLimit: config.db.connectionLimit,
      queueLimit: 0,
      charset: 'utf8mb4_unicode_ci',
      timezone: 'Z',
      // DECIMAL/INT come back as strings otherwise; these are safe casts
      decimalNumbers: true,
      supportBigNumbers: true,
      bigNumberStrings: false,
      dateStrings: false,
      namedPlaceholders: false,
    });
  }
  return pool;
};

/** Run a query, return rows. */
export const query = async (sql, params = []) => {
  const [rows] = await getPool().execute(sql, params);
  return rows;
};

/** Run a query, return the first row or null. */
export const queryOne = async (sql, params = []) => {
  const rows = await query(sql, params);
  return rows.length ? rows[0] : null;
};

/**
 * Execute `fn` inside a transaction. Rolls back on any throw.
 * `fn` receives the connection; use conn.execute() inside.
 */
export const withTransaction = async (fn) => {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
};

/** Cheap liveness probe used by GET /api/health. */
export const ping = async () => {
  const row = await queryOne('SELECT 1 AS ok');
  return row?.ok === 1;
};
