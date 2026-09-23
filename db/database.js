'use strict';

/*
 * SQLite access layer built on Node's built-in `node:sqlite` module
 * (no native compilation needed). A thin wrapper exposes the small subset
 * of the better-sqlite3 API the app relies on: prepare / exec / transaction.
 */

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'billing.db');
const raw = new DatabaseSync(DB_PATH);

raw.exec('PRAGMA journal_mode = WAL;');
raw.exec('PRAGMA foreign_keys = ON;');

// Apply schema (idempotent — everything uses IF NOT EXISTS)
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
raw.exec(schema);

const db = {
  prepare: (sql) => raw.prepare(sql),
  exec: (sql) => raw.exec(sql),
  /**
   * Wrap a function so all its DB work runs in a single transaction.
   * Mirrors better-sqlite3's db.transaction(fn) → returns a callable.
   * Nesting is supported via SAVEPOINTs so a transactional helper can be
   * called from inside another transaction safely.
   */
  transaction(fn) {
    return (...args) => {
      const depth = raw._txDepth || 0;
      const sp = `sp_${depth}`;
      raw.exec(depth === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`);
      raw._txDepth = depth + 1;
      try {
        const result = fn(...args);
        raw._txDepth = depth;
        raw.exec(depth === 0 ? 'COMMIT' : `RELEASE ${sp}`);
        return result;
      } catch (err) {
        raw._txDepth = depth;
        raw.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}`);
        throw err;
      }
    };
  },
  raw,
};

module.exports = db;
