/**
 * One-command database setup.
 *
 *   npm run db:setup
 *
 * Creates the database, applies database.sql + sql/001_extensions.sql +
 * sql/002_remove_test_data.sql, then runs the idempotent seed. Safe to re-run.
 *
 * Notes:
 *  - SQL files are read as UTF-8 Buffers on purpose. Piping them through the
 *    shell corrupts Arabic text into "?" because the Windows console codepage
 *    is not UTF-8.
 *  - `DELIMITER` is a mysql CLI directive, not server SQL, so statements are
 *    split here instead of relying on multipleStatements.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const {
  DB_HOST = 'localhost',
  DB_PORT = '3306',
  DB_NAME = 'watanya',
  // Setup needs CREATE DATABASE + DROP, which the runtime app user should not
  // have. These default to the runtime credentials so a single-user dev setup
  // still works, but can be pointed at a root/admin account.
  SETUP_DB_USER = process.env.DB_USER || 'root',
  SETUP_DB_PASSWORD = process.env.DB_PASSWORD || '',
  // The runtime account that the API actually connects with. Needs a grant on
  // the freshly created database.
  DB_USER = SETUP_DB_USER,
} = process.env;

const q = (name) => `\`${String(name).replace(/`/g, '``')}\``;

/** Account name in a user@host spec, which is a string literal not an identifier. */
const quoteUser = (name) => `'${String(name).replace(/'/g, "''")}'`;

/**
 * Splits a SQL script into executable statements, honouring DELIMITER blocks
 * so CREATE PROCEDURE ... BEGIN ... END; survives intact.
 *
 * Quote-aware: a delimiter inside a string literal, a quoted identifier or a
 * comment is not a statement boundary. A naive indexOf() scan would truncate
 * any statement like  VALUES ('نص؛')  at the first semicolon it met.
 */
export function splitStatements(sql) {
  const statements = [];
  let delimiter = ';';
  let buffer = '';
  let quote = null; // ' " or ` when inside a quoted run

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];

    // Line comment runs to end of line and is dropped entirely.
    if (!quote && ch === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl;
      continue;
    }
    // Block comments are dropped too.
    if (!quote && ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }

    if (quote) {
      buffer += ch;
      if (ch === '\\' && quote !== '`') { // backslash escape
        if (i + 1 < sql.length) { buffer += sql[i + 1]; i++; }
        continue;
      }
      if (ch === quote) {
        // Doubled quote ('' or "") is an escaped quote, not a terminator.
        if (sql[i + 1] === quote) { buffer += sql[++i]; continue; }
        quote = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; buffer += ch; continue; }

    if (ch === 'D' || ch === 'd') {
      // DELIMITER directive (only valid at the start of a line).
      const atLineStart = buffer.trim() === '';
      if (atLineStart && /^delimiter\s+\S+\s*;?\s*$/i.test(sql.slice(i, i + 64).split('\n')[0])) {
        const m = sql.slice(i, i + 64).split('\n')[0].match(/^delimiter\s+(\S+)/i);
        if (buffer.trim()) { statements.push(buffer.trim()); buffer = ''; }
        delimiter = m[1];
        const nl = sql.indexOf('\n', i);
        i = nl === -1 ? sql.length : nl;
        continue;
      }
    }

    // Delimiter match must come before appending, and must handle multi-char
    // delimiters like $$ - comparing a single char to '$$' would never match.
    if (delimiter && sql.startsWith(delimiter, i)) {
      const stmt = buffer.trim();
      if (stmt) statements.push(stmt);
      buffer = '';
      i += delimiter.length - 1;
      continue;
    }

    buffer += ch;
  }

  if (buffer.trim()) statements.push(buffer.trim());
  return statements;
}

// Re-running setup must not wipe seeded data, so "already there" is a no-op
// rather than a failure. Anything else is a real error.
const TOLERATED = new Set([
  'ER_TABLE_EXISTS_ERROR', // CREATE TABLE
  'ER_DUP_KEYNAME', // index already present
  'ER_DUP_FIELDNAME',
  'ER_PROC_ALREADY_EXISTS',
  'ER_FK_DUP_NAME',
  // database.sql seeds rows with explicit ids. A duplicate key here means the
  // row is already present with the intended values, so skipping is correct -
  // and it keeps the supplied SQL file untouched.
  'ER_DUP_ENTRY',
]);

/**
 * database.sql hardcodes its own CREATE DATABASE / USE, which silently
 * redirects every later statement to that database and ignores DB_NAME.
 * Point those two statements at the configured database instead.
 */
function retargetDatabase(stmt) {
  const create = stmt.match(/^\s*CREATE\s+DATABASE(\s+IF\s+NOT\s+EXISTS)?\s+([^\s;]+)/i);
  if (create) {
    const ifNotExists = create[1] ? ' IF NOT EXISTS' : '';
    return `CREATE DATABASE${ifNotExists} ${q(DB_NAME)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`;
  }
  if (/^\s*USE\s+/i.test(stmt)) return `USE ${q(DB_NAME)}`;
  return stmt;
}

async function runFile(conn, file) {
  const full = path.join(ROOT, file);
  const buf = await readFile(full); // Buffer keeps UTF-8 intact
  const statements = splitStatements(buf.toString('utf8'));
  let skipped = 0;
  console.log(`[setup] ${file}: ${statements.length} statements`);

  for (const raw of statements) {
    const stmt = retargetDatabase(raw);
    try {
      await conn.query(stmt);
    } catch (err) {
      if (TOLERATED.has(err.code)) { skipped++; continue; }
      console.error(`\n[setup] FAILED in ${file}:\n${stmt.slice(0, 400)}\n`);
      if (err.sqlState === '42000' && /denied/i.test(err.message)) {
        console.error(
          'Hint: the connecting user needs CREATE DATABASE rights.\n' +
          '      Set SETUP_DB_USER / SETUP_DB_PASSWORD to an admin account.\n'
        );
      }
      throw err;
    }
  }
  if (skipped) console.log(`[setup] ${file}: ${skipped} already-existing objects skipped`);
}

function runSeed() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'seed.js')], {
      stdio: 'inherit',
      cwd: ROOT,
    });
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`seed exited with code ${code}`))
    );
    child.on('error', reject);
  });
}

const main = async () => {
  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: SETUP_DB_USER,
    password: SETUP_DB_PASSWORD,
    // Multiple statements are split manually, so keep this off.
    multipleStatements: false,
    charset: 'utf8mb4',
  });

  try {
    console.log(`[setup] connected to ${SETUP_DB_USER}@${DB_HOST}:${DB_PORT}`);
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS ${q(DB_NAME)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    console.log(`[setup] database ready: ${DB_NAME}`);
    await conn.query(`USE ${q(DB_NAME)}`);

    // When setup runs as an admin account, the restricted runtime account still
    // needs access to the database that was just created.
    if (SETUP_DB_USER !== DB_USER) {
      const runtimeHost = process.env.DB_HOST || 'localhost';
      // conn.query() is client-side escaping, not prepared statements, so the
      // password has to be interpolated by hand - a ? placeholder is not
      // supported here and would be sent literally.
      const literal = quoteUser(process.env.DB_PASSWORD || '');
      await conn.query(
        `CREATE USER IF NOT EXISTS ${quoteUser(DB_USER)}@${quoteUser(runtimeHost)} IDENTIFIED BY ${literal}`
      );
      await conn.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ${q(DB_NAME)}.* TO ${quoteUser(DB_USER)}@${quoteUser(runtimeHost)}`
      );
      console.log(`[setup] granted ${DB_USER}@${runtimeHost} access to ${DB_NAME}`);
    }

    await runFile(conn, 'database.sql');
    await runFile(conn, path.join('sql', '001_extensions.sql'));
    // Purges the fake customers/reviews older seeds wrote, before seeding re-runs.
    await runFile(conn, path.join('sql', '002_remove_test_data.sql'));
    console.log('[setup] schema applied');
  } finally {
    await conn.end();
  }

  console.log('[setup] seeding...');
  await runSeed();
  console.log('\n[setup] done. Start the API with: npm start');
};

// Only run when executed directly, so splitStatements can be imported for tests.
if (import.meta.main) {
  main().catch((err) => {
    console.error('[setup] FAILED:', err.message || err);
    process.exit(1);
  });
}
