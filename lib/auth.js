'use strict';

const crypto = require('crypto');
const db = require('../db/database');

/* ============================================================
   Password hashing — Node built-in scrypt (no native deps)
   Stored format:  scrypt$<saltHex>$<hashHex>
   ============================================================ */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(String(password), salt, expected.length);
    return crypto.timingSafeEqual(actual, expected);
  } catch (_) {
    return false;
  }
}

/* ============================================================
   Middleware
   ============================================================ */
function requireAuth(req, res, next) {
  const uid = req.session && req.session.userId;
  if (!uid) return res.status(401).json({ error: 'Not authenticated' });
  const user = db
    .prepare('SELECT id, org_id, email, name, is_active FROM users WHERE id = ?')
    .get(uid);
  if (!user || !user.is_active) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Session invalid' });
  }
  req.user = user;
  req.orgId = user.org_id;
  req.org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(user.org_id);
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  requireAuth,
};
