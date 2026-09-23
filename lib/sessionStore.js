'use strict';

const session = require('express-session');
const db = require('../db/database');

/**
 * Minimal express-session store backed by the app's node:sqlite database.
 * Avoids extra native dependencies (connect-sqlite3 pulls in native sqlite3).
 */
class SqliteStore extends session.Store {
  constructor() {
    super();
    this.getStmt = db.prepare('SELECT sess, expire FROM sessions WHERE sid = ?');
    this.setStmt = db.prepare(
      `INSERT INTO sessions (sid, sess, expire) VALUES (@sid, @sess, @expire)
       ON CONFLICT(sid) DO UPDATE SET sess = @sess, expire = @expire`
    );
    this.delStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchStmt = db.prepare('UPDATE sessions SET expire = ? WHERE sid = ?');
    // Periodically sweep expired sessions.
    setInterval(() => {
      try { db.prepare('DELETE FROM sessions WHERE expire < ?').run(Date.now()); } catch (_) {}
    }, 60 * 60 * 1000).unref();
  }

  get(sid, cb) {
    try {
      const row = this.getStmt.get(sid);
      if (!row) return cb(null, null);
      if (row.expire < Date.now()) { this.delStmt.run(sid); return cb(null, null); }
      cb(null, JSON.parse(row.sess));
    } catch (e) { cb(e); }
  }

  set(sid, sess, cb) {
    try {
      const expire = sess.cookie && sess.cookie.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + 7 * 24 * 60 * 60 * 1000;
      this.setStmt.run({ sid, sess: JSON.stringify(sess), expire });
      cb && cb(null);
    } catch (e) { cb && cb(e); }
  }

  destroy(sid, cb) {
    try { this.delStmt.run(sid); cb && cb(null); } catch (e) { cb && cb(e); }
  }

  touch(sid, sess, cb) {
    try {
      const expire = sess.cookie && sess.cookie.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + 7 * 24 * 60 * 60 * 1000;
      this.touchStmt.run(expire, sid);
      cb && cb(null);
    } catch (e) { cb && cb(e); }
  }
}

module.exports = SqliteStore;
