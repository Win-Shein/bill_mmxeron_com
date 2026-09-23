'use strict';

/*
 * German tax compliance (Finanzamt / GoBD / UStG / EÜR) tests.
 *
 * These run against a throwaway SQLite file (see DB_PATH below) so the real
 * data/billing.db is never touched. The DB is created and migrated fresh on
 * require, then seeded with the minimal org/settings/customer rows the
 * service layer needs.
 */

const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

// Isolate the database BEFORE requiring any module that touches it.
const tmpDb = path.join(os.tmpdir(), `billing-test-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = tmpDb;

const db = require('../db/database');
const { computeVatExemption, isEuCountry, DRITTLAND_CLAUSE, KLEINUNTERNEHMER_CLAUSE } = require('../lib/taxRules');
const {
  recalcInvoice, replaceLineItems, draftInvoiceNo, issueInvoice, cancelInvoice, round2,
} = require('../lib/invoiceService');

function seedOrg({ kleinunternehmer = 0 } = {}) {
  const orgId = db.prepare("INSERT INTO organizations (name) VALUES ('Test GmbH')").run().lastInsertRowid;
  db.prepare(
    `INSERT INTO settings (org_id, company_name, tax_number, invoice_prefix, is_kleinunternehmer)
     VALUES (?, 'Test GmbH', 'DE 123 456 789', 'INV-', ?)`
  ).run(orgId, kleinunternehmer ? 1 : 0);
  return orgId;
}

function seedCustomer(orgId, country = 'Myanmar') {
  return db.prepare("INSERT INTO customers (org_id, name, country) VALUES (?, 'Client Co', ?)")
    .run(orgId, country).lastInsertRowid;
}

function createDraft(orgId, customerId, { servicePeriod = true, lineTax = 19, qty = 1, price = 100 } = {}) {
  const id = db.prepare(
    `INSERT INTO invoices (org_id, invoice_no, customer_id, issue_date, status, currency,
                           client_country, service_period_start, service_period_end)
     VALUES (?, ?, ?, '2026-09-01', 'draft', 'USD', 'Myanmar', ?, ?)`
  ).run(
    orgId, draftInvoiceNo(), customerId,
    servicePeriod ? '2026-09-01' : null, servicePeriod ? '2026-09-30' : null
  ).lastInsertRowid;
  replaceLineItems(id, [{ description: 'Consulting', quantity: qty, unit_price: price, tax_rate: lineTax }]);
  recalcInvoice(id);
  return id;
}

test('taxRules: EU country detection', () => {
  assert.strictEqual(isEuCountry('Germany'), true);
  assert.strictEqual(isEuCountry('Italy'), true);
  assert.strictEqual(isEuCountry('Myanmar'), false);
  assert.strictEqual(isEuCountry('United States'), false);
  assert.strictEqual(isEuCountry(''), false);
});

test('taxRules: Drittland export is VAT-exempt', () => {
  const r = computeVatExemption({ clientCountry: 'Myanmar', isKleinunternehmer: false });
  assert.strictEqual(r.vat_rate, 0);
  assert.strictEqual(r.vat_exemption_reason, DRITTLAND_CLAUSE);
});

test('taxRules: Kleinunternehmer overrides even for EU clients', () => {
  const r = computeVatExemption({ clientCountry: 'Germany', isKleinunternehmer: true });
  assert.strictEqual(r.vat_rate, 0);
  assert.strictEqual(r.vat_exemption_reason, KLEINUNTERNEHMER_CLAUSE);
});

test('taxRules: EU client without Kleinunternehmer keeps normal VAT (no override)', () => {
  const r = computeVatExemption({ clientCountry: 'Germany', isKleinunternehmer: false });
  assert.strictEqual(r.vat_rate, null);
  assert.strictEqual(r.vat_exemption_reason, null);
});

test('invoice lifecycle: issue assigns INV-YYYY-XXXX and locks the invoice', () => {
  const orgId = seedOrg();
  const custId = seedCustomer(orgId);
  const id = createDraft(orgId, custId);

  const before = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  assert.strictEqual(before.is_locked, 0);
  assert.match(before.invoice_no, /^DRAFT-/);

  const issued = issueInvoice(id, orgId);
  assert.strictEqual(issued.is_locked, 1);
  assert.strictEqual(issued.status, 'sent');
  assert.match(issued.invoice_no, /^INV-2026-\d{4}$/);
  assert.strictEqual(issued.invoice_no, 'INV-2026-0001');
  assert.strictEqual(issued.vat_rate, 0);
  assert.strictEqual(issued.vat_exemption_reason, DRITTLAND_CLAUSE);
  assert.strictEqual(issued.issuer_tax_number, 'DE 123 456 789');
});

test('invoice lifecycle: VAT exemption zeroes line-item tax on issue', () => {
  const orgId = seedOrg();
  const custId = seedCustomer(orgId);
  const id = createDraft(orgId, custId, { lineTax: 19 });

  issueInvoice(id, orgId);
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(id);
  for (const it of items) assert.strictEqual(it.tax_rate, 0);
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  assert.strictEqual(round2(inv.tax_total), 0);
  assert.strictEqual(round2(inv.total), 100);
});

test('invoice lifecycle: issue requires a service period (Leistungszeitraum)', () => {
  const orgId = seedOrg();
  const custId = seedCustomer(orgId);
  const id = createDraft(orgId, custId, { servicePeriod: false });
  assert.throws(() => issueInvoice(id, orgId), (e) => e.status === 400 && /service period/i.test(e.message));
});

test('invoice lifecycle: an issued invoice cannot be issued again', () => {
  const orgId = seedOrg();
  const custId = seedCustomer(orgId);
  const id = createDraft(orgId, custId);
  issueInvoice(id, orgId);
  assert.throws(() => issueInvoice(id, orgId), (e) => e.status === 409);
});

test('cancellation: creates a negative Stornorechnung and cancels the original', () => {
  const orgId = seedOrg();
  const custId = seedCustomer(orgId);
  const id = createDraft(orgId, custId, { qty: 2, price: 100 });
  issueInvoice(id, orgId);

  const { original, storno } = cancelInvoice(id, orgId);

  assert.strictEqual(original.status, 'cancelled');
  assert.strictEqual(storno.original_invoice_id, id);
  assert.strictEqual(storno.is_locked, 1);
  assert.match(storno.invoice_no, /^INV-2026-\d{4}$/);
  assert.strictEqual(storno.invoice_no, 'INV-2026-0002'); // sequential, no gap
  assert.ok(storno.total < 0, 'storno total should be negative');
  assert.strictEqual(round2(storno.total), -200);
});

test('cancellation: only issued invoices can be cancelled', () => {
  const orgId = seedOrg();
  const custId = seedCustomer(orgId);
  const id = createDraft(orgId, custId);
  assert.throws(() => cancelInvoice(id, orgId), (e) => e.status === 409);
});

test('cancellation: a Stornorechnung cannot itself be cancelled', () => {
  const orgId = seedOrg();
  const custId = seedCustomer(orgId);
  const id = createDraft(orgId, custId);
  issueInvoice(id, orgId);
  const { storno } = cancelInvoice(id, orgId);
  assert.throws(() => cancelInvoice(storno.id, orgId), (e) => e.status === 409);
});

test('numbering: sequence is per-year and gapless', () => {
  const orgId = seedOrg();
  const custId = seedCustomer(orgId);

  const ids = [];
  for (let i = 0; i < 3; i++) {
    const id = createDraft(orgId, custId);
    issueInvoice(id, orgId);
    ids.push(id);
  }

  const numbers = ids.map((id) => db.prepare('SELECT invoice_no FROM invoices WHERE id = ?').get(id).invoice_no);
  assert.deepStrictEqual(numbers, ['INV-2026-0001', 'INV-2026-0002', 'INV-2026-0003']);
});

test('numbering: Kleinunternehmer invoice is exempt with § 19 clause', () => {
  const orgId = seedOrg({ kleinunternehmer: 1 });
  const custId = seedCustomer(orgId, 'Germany');
  const id = createDraft(orgId, custId, { lineTax: 19 });

  const issued = issueInvoice(id, orgId);
  assert.strictEqual(issued.vat_rate, 0);
  assert.strictEqual(issued.vat_exemption_reason, KLEINUNTERNEHMER_CLAUSE);
  assert.strictEqual(round2(issued.tax_total), 0);
});

test.after(() => {
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(tmpDb + suffix); } catch (_) { /* ignore */ }
  }
});
