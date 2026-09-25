'use strict';

/*
 * Renewal / expiry tracking tests (VPS, Domain, Hosting, License...).
 * Runs against a throwaway SQLite file so the real data/billing.db is never
 * touched.
 */

const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const tmpDb = path.join(os.tmpdir(), `billing-renewals-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = tmpDb;

const db = require('../db/database');
const {
  replaceLineItems, recalcInvoice, draftInvoiceNo, issueInvoice, cancelInvoice,
} = require('../lib/invoiceService');
const { listRenewals } = require('../lib/renewals');

function seedOrg() {
  const orgId = db.prepare("INSERT INTO organizations (name) VALUES ('Renewals GmbH')").run().lastInsertRowid;
  db.prepare(
    `INSERT INTO settings (org_id, company_name, invoice_prefix) VALUES (?, 'Renewals GmbH', 'INV-')`
  ).run(orgId);
  return orgId;
}

function seedCustomer(orgId) {
  return db.prepare("INSERT INTO customers (org_id, name) VALUES (?, 'Client Co')")
    .run(orgId).lastInsertRowid;
}

function createDraft(orgId, customerId, lines) {
  const id = db.prepare(
    `INSERT INTO invoices (org_id, invoice_no, customer_id, issue_date, status, currency,
                           client_country, service_period_start, service_period_end)
     VALUES (?, ?, ?, '2026-09-01', 'draft', 'EUR', 'Myanmar', '2026-09-01', '2026-12-31')`
  ).run(orgId, draftInvoiceNo(), customerId).lastInsertRowid;
  replaceLineItems(id, lines);
  recalcInvoice(id);
  return id;
}

test('renewals: latest expiry per customer + product is listed', () => {
  const orgId = seedOrg();
  const custId = seedCustomer(orgId);

  const older = createDraft(orgId, custId, [{
    description: 'example.com', category: 'Domain',
    quantity: 1, unit_price: 12, tax_rate: 0,
    service_start: '2025-01-01', service_end: '2026-01-01',
  }]);
  issueInvoice(older, orgId);

  const newer = createDraft(orgId, custId, [{
    description: 'example.com', category: 'Domain',
    quantity: 1, unit_price: 12, tax_rate: 0,
    service_start: '2026-01-01', service_end: '2027-01-01',
  }]);
  issueInvoice(newer, orgId);

  const rows = listRenewals(orgId);
  assert.strictEqual(rows.length, 1, 'same customer + domain collapses to one row');
  assert.strictEqual(rows[0].expires_at, '2027-01-01');
  assert.strictEqual(rows[0].category, 'Domain');
  assert.strictEqual(rows[0].customer_name, 'Client Co');
  assert.ok(typeof rows[0].days_left === 'number');
});

test('renewals: lines without an expiry are ignored', () => {
  const orgId = seedOrg();
  const custId = seedCustomer(orgId);

  const id = createDraft(orgId, custId, [{
    description: 'Consulting', category: 'Other',
    quantity: 1, unit_price: 100, tax_rate: 0,
  }]);
  issueInvoice(id, orgId);

  assert.strictEqual(listRenewals(orgId).length, 0);
});

test('renewals: drafts are not treated as active subscriptions', () => {
  const orgId = seedOrg();
  const custId = seedCustomer(orgId);

  createDraft(orgId, custId, [{
    description: 'vps.example.net', category: 'VPS',
    quantity: 1, unit_price: 12, tax_rate: 0,
    service_start: '2026-09-01', service_end: '2026-10-01',
  }]);

  assert.strictEqual(listRenewals(orgId).length, 0);
});

test('renewals: cancelled invoices (and their Stornorechnung) are excluded', () => {
  const orgId = seedOrg();
  const custId = seedCustomer(orgId);

  const id = createDraft(orgId, custId, [{
    description: 'vps.example.net', category: 'VPS',
    quantity: 1, unit_price: 12, tax_rate: 0,
    service_start: '2026-09-01', service_end: '2026-10-01',
  }]);
  issueInvoice(id, orgId);
  assert.strictEqual(listRenewals(orgId).length, 1);

  cancelInvoice(id, orgId);
  assert.strictEqual(listRenewals(orgId).length, 0);
});

test.after(() => {
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(tmpDb + suffix); } catch (_) { /* ignore */ }
  }
});
