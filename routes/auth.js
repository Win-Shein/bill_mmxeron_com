'use strict';

const express = require('express');
const db = require('../db/database');
const { hashPassword, verifyPassword, requireAuth } = require('../lib/auth');

const router = express.Router();

const emailOk = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

function publicUser(user, org) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    org: { id: org.id, name: org.name },
  };
}

// ---- Register: creates the single account (org + user) ----
router.post('/register', (req, res) => {
  const { company_name, name, email, password } = req.body;
  if (!company_name || !company_name.trim()) return res.status(400).json({ error: 'Company name is required' });
  if (!emailOk(email || '')) return res.status(400).json({ error: 'A valid email is required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'Email is already registered' });

  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount > 0) return res.status(409).json({ error: 'This app already has an account' });

  const create = db.transaction(() => {
    const orgId = db.prepare('INSERT INTO organizations (name) VALUES (?)').run(company_name.trim()).lastInsertRowid;
    db.prepare('INSERT INTO settings (org_id, company_name) VALUES (?, ?)').run(orgId, company_name.trim());
    const userId = db
      .prepare('INSERT INTO users (org_id, email, password_hash, name) VALUES (?,?,?,?)')
      .run(orgId, email.toLowerCase(), hashPassword(password), name || null).lastInsertRowid;
    return userId;
  });

  const userId = create();
  req.session.userId = userId;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(user.org_id);
  res.status(201).json(publicUser(user, org));
});

// ---- Login ----
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').toLowerCase());
  if (!user || !user.is_active || !verifyPassword(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
  req.session.userId = user.id;
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(user.org_id);
  res.json(publicUser(user, org));
});

// ---- Logout ----
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ---- Current user ----
router.get('/me', requireAuth, (req, res) => {
  res.json(publicUser(req.user, req.org));
});

// ---- Update own email ----
router.put('/email', requireAuth, (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!emailOk(email)) return res.status(400).json({ error: 'A valid email is required' });
  if (db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, req.user.id)) {
    return res.status(409).json({ error: 'Email is already in use' });
  }
  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, req.user.id);
  res.json({ ok: true });
});

// ---- Update own password ----
router.put('/password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(current_password || '', user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(new_password), req.user.id);
  res.json({ ok: true });
});

module.exports = { router, publicUser };
