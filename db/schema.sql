-- ============================================================
--  Billing System - SQLite schema (single-user, personal use)
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------- Organization (single implicit tenant) ----------
CREATE TABLE IF NOT EXISTS organizations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Users (single user) ----------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id        INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  name          TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  last_login    TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);

-- ---------- Session store (express-session) ----------
CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  sess    TEXT    NOT NULL,
  expire  INTEGER NOT NULL
);

-- ---------- Company / app settings ----------
CREATE TABLE IF NOT EXISTS settings (
  org_id          INTEGER PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  company_name    TEXT    NOT NULL DEFAULT 'My Company',
  email           TEXT,
  phone           TEXT,
  address         TEXT,
  city            TEXT,
  country         TEXT,
  tax_number      TEXT,
  currency        TEXT    NOT NULL DEFAULT 'EUR',
  currency_symbol TEXT    NOT NULL DEFAULT '€',
  default_tax     REAL    NOT NULL DEFAULT 0,
  invoice_prefix  TEXT    NOT NULL DEFAULT 'INV-',
  invoice_next    INTEGER NOT NULL DEFAULT 1,
  language        TEXT    NOT NULL DEFAULT 'en',
  logo_url        TEXT,
  notes           TEXT,
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Customers ----------
CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id        INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  company       TEXT,
  email         TEXT,
  phone         TEXT,
  address       TEXT,
  city          TEXT,
  country       TEXT,
  tax_number    TEXT,
  notes         TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(org_id);

-- ---------- Items / Products ----------
CREATE TABLE IF NOT EXISTS items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id        INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  sku           TEXT,
  description   TEXT,
  category      TEXT    DEFAULT 'Other',
  billing_cycle TEXT    NOT NULL DEFAULT 'one-time',
  unit          TEXT    DEFAULT 'pcs',
  price         REAL    NOT NULL DEFAULT 0,
  tax_rate      REAL    NOT NULL DEFAULT 0,
  stock         REAL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_items_org ON items(org_id);

-- ---------- Invoices ----------
CREATE TABLE IF NOT EXISTS invoices (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id         INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_no     TEXT    NOT NULL,
  customer_id    INTEGER NOT NULL REFERENCES customers(id),
  issue_date     TEXT    NOT NULL DEFAULT (date('now')),
  due_date       TEXT,
  status         TEXT    NOT NULL DEFAULT 'draft',
  currency       TEXT    NOT NULL DEFAULT 'EUR',
  subtotal       REAL    NOT NULL DEFAULT 0,
  discount       REAL    NOT NULL DEFAULT 0,
  tax_total      REAL    NOT NULL DEFAULT 0,
  total          REAL    NOT NULL DEFAULT 0,
  amount_paid    REAL    NOT NULL DEFAULT 0,
  notes          TEXT,
  terms          TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (org_id, invoice_no)
);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);

-- ---------- Invoice line items ----------
CREATE TABLE IF NOT EXISTS invoice_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id    INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_id       INTEGER REFERENCES items(id),
  description   TEXT    NOT NULL,
  quantity      REAL    NOT NULL DEFAULT 1,
  unit_price    REAL    NOT NULL DEFAULT 0,
  tax_rate      REAL    NOT NULL DEFAULT 0,
  line_total    REAL    NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- ---------- Payments ----------
CREATE TABLE IF NOT EXISTS payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id        INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id    INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount        REAL    NOT NULL,
  method        TEXT    NOT NULL DEFAULT 'cash',
  reference     TEXT,
  paid_at       TEXT    NOT NULL DEFAULT (date('now')),
  notes         TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_org ON payments(org_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
