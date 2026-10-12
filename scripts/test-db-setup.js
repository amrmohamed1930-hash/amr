/**
 * Unit tests for the SQL statement splitter in db-setup.js.
 *
 *   node scripts/test-db-setup.js
 *
 * The splitter has to keep CREATE PROCEDURE ... BEGIN ... END; intact, because
 * DELIMITER is a mysql CLI directive that the driver never sees. A regression
 * here silently truncates the schema migration.
 */
import { splitStatements } from './db-setup.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
let pass = 0;

function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}

const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const ext = splitStatements(read('sql/001_extensions.sql'));
const base = splitStatements(read('database.sql'));

console.log(`base: ${base.length} statements, extensions: ${ext.length}`);

const procs = ext.filter((s) => /CREATE\s+PROCEDURE/i.test(s));
ok('exactly one CREATE PROCEDURE captured', procs.length === 1, `got ${procs.length}`);
ok('procedure keeps its BEGIN...END body', /BEGIN[\s\S]*END\s*$/i.test(procs[0] || ''));
ok('procedure body semicolons survive',
  (procs[0]?.match(/;/g) || []).length >= 3,
  `${(procs[0]?.match(/;/g) || []).length} semicolons`);
ok('no DELIMITER directive leaked into statements', !ext.some((s) => /^\s*DELIMITER/i.test(s)));
ok('no empty statements', !ext.some((s) => s.trim() === ''));
ok('no comment-only statements', !ext.some((s) => /^\s*(--|\/\*)/.test(s)));
ok('extension CREATE TABLE statements parsed', ext.filter((s) => /^\s*CREATE TABLE/i.test(s)).length >= 8);
ok('CALL statements survive', ext.filter((s) => /^\s*CALL/i.test(s)).length > 0);
ok('every statement starts with a SQL keyword (no mid-statement fragments)',
  ext.every((s) => /^\s*(CREATE|ALTER|DROP|CALL|INSERT|UPDATE|DELETE|SET|SELECT|USE|TRUNCATE|RENAME)\b/i.test(s)),
  ext.filter((s) => !/^\s*(CREATE|ALTER|DROP|CALL|INSERT|UPDATE|DELETE|SET|SELECT|USE|TRUNCATE|RENAME)\b/i.test(s)).join(' || '));
ok('base schema CREATE TABLE statements parsed', base.filter((s) => /^\s*CREATE TABLE/i.test(s)).length >= 5);
ok('base schema keeps Arabic text intact', base.some((s) => /[\u0600-\u06FF]/.test(s)));

// db-setup also applies sql/002_remove_test_data.sql, and db-setup passes DELETE /
// UPDATE statements through the same splitter. If it mangled those, the purge
// would silently do nothing on an existing database.
const purge = splitStatements(read('sql/002_remove_test_data.sql'));
console.log(`purge: ${purge.length} statements`);
ok('purge deletes the seeded test customers',
  purge.some((s) => /^\s*DELETE FROM customers/i.test(s) && /ahmed@watanya\.com/.test(s)),
  JSON.stringify(purge));
ok('purge statement carries all five seeded emails',
  ['ahmed', 'sara', 'khaled', 'noura', 'mohammed'].every((n) =>
    purge.some((s) => s.includes(`${n}@watanya.com`))));
ok('purge never writes to the admins table',
  !purge.some((s) => /\b(DELETE\s+FROM|UPDATE|INSERT\s+INTO|TRUNCATE)\s+admins\b/i.test(s)),
  JSON.stringify(purge.filter((s) => /admins/i.test(s))));
ok('purge recomputes product ratings', purge.some((s) => /UPDATE\s+products/i.test(s) && /rating_avg/.test(s)));
ok('purge keeps Arabic review titles intact',
  purge.some((s) => /ممتاز/.test(s) && /DELETE FROM reviews/i.test(s)));

// A trailing statement with no delimiter must still be emitted.
const noTrailing = splitStatements('SELECT 1;\nSELECT 2');
ok('trailing statement without delimiter is kept', noTrailing.length === 2, JSON.stringify(noTrailing));

// Delimiters inside quoted runs must not split.
const semiInString = splitStatements("INSERT INTO t (a) VALUES ('x;y');");
ok('semicolon inside a string literal does not split', semiInString.length === 1, JSON.stringify(semiInString));
ok('string literal content is preserved', semiInString[0] === "INSERT INTO t (a) VALUES ('x;y')", JSON.stringify(semiInString[0]));

const doubled = splitStatements("INSERT INTO t (a) VALUES ('it''s; fine'); SELECT 1;");
ok('doubled quote does not end the string', doubled.length === 2, JSON.stringify(doubled));

const backtick = splitStatements('SELECT `we;ird` FROM t;');
ok('semicolon inside a backtick identifier does not split', backtick.length === 1, JSON.stringify(backtick));

const arSemicolon = splitStatements("INSERT INTO p (name) VALUES ('جهاز؛Excellent');");
ok('Arabic text with an Arabic semicolon is not split', arSemicolon.length === 1, JSON.stringify(arSemicolon));

const commented = splitStatements('-- a comment; with semicolon\nSELECT 1;');
ok('comment semicolons are ignored', commented.length === 1 && commented[0] === 'SELECT 1', JSON.stringify(commented));

const block = splitStatements('/* block; comment */ SELECT 1;');
ok('block comment semicolons are ignored', block.length === 1 && block[0] === 'SELECT 1', JSON.stringify(block));

// DELIMITER switching must not leak and must keep the procedure body whole.
const delim = splitStatements(
  'CREATE TABLE a (id INT);\nDELIMITER $$\nCREATE PROCEDURE p() BEGIN SELECT 1; SELECT 2; END$$\nDELIMITER ;\nCALL p();'
);
ok('DELIMITER block yields 3 statements', delim.length === 3, `got ${delim.length}: ${JSON.stringify(delim)}`);
ok('procedure body is one statement with its inner semicolons',
  /^CREATE PROCEDURE p\(\) BEGIN SELECT 1; SELECT 2; END$/.test(delim[1] || ''), JSON.stringify(delim[1]));
ok('statement after DELIMITER reset is parsed', delim[2] === 'CALL p()', JSON.stringify(delim[2]));

console.log(fail === 0 ? `\n${pass} passed, 0 failed` : `\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
