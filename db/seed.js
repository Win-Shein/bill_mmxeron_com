'use strict';

/* Seed starter data for the single-user (personal) billing system.
   Creates one account + sample catalog, customers and invoices.
   Safe to re-run: wipes existing rows first. */

const db = require('./database');
const { replaceLineItems, recalcInvoice, nextInvoiceNo } = require('../lib/invoiceService');
const { hashPassword } = require('../lib/auth');

console.log('Resetting & seeding starter data…');

for (const t of ['payments', 'invoice_items', 'invoices', 'items', 'customers', 'settings', 'users', 'organizations', 'sessions']) {
  db.exec(`DELETE FROM ${t}`);
}
db.exec("DELETE FROM sqlite_sequence WHERE name NOT NULL");

const org = db.prepare('INSERT INTO organizations (name) VALUES (?)').run('My Company').lastInsertRowid;

db.prepare('INSERT INTO settings (org_id, company_name, currency, currency_symbol) VALUES (?, ?, ?, ?)')
  .run(org, 'My Company', 'EUR', '€');

db.prepare('INSERT INTO users (org_id, email, password_hash, name) VALUES (?,?,?,?)')
  .run(org, 'admin@example.com', hashPassword('admin1234'), 'Admin');

// ---- Catalog ----
const itemStmt = db.prepare(
  `INSERT INTO items (org_id, name, sku, category, billing_cycle, unit, price, tax_rate, stock)
   VALUES (@org,@name,@sku,@category,@billing_cycle,@unit,@price,@tax_rate,@stock)`
);
const catalog = [
  { name: 'VPS Basic (2 vCPU / 4GB RAM / 80GB SSD)', sku: 'VPS-B', category: 'VPS', billing_cycle: 'monthly', unit: 'month', price: 12, tax_rate: 0, stock: null },
  { name: 'VPS Pro (4 vCPU / 8GB RAM / 160GB SSD)', sku: 'VPS-P', category: 'VPS', billing_cycle: 'monthly', unit: 'month', price: 24, tax_rate: 0, stock: null },
  { name: 'VPN Business (10 users)', sku: 'VPN-10', category: 'VPN', billing_cycle: 'monthly', unit: 'month', price: 30, tax_rate: 0, stock: null },
  { name: 'Domain Registration (.com)', sku: 'DOM-COM', category: 'Domain', billing_cycle: 'yearly', unit: 'year', price: 12, tax_rate: 0, stock: null },
  { name: 'Web Hosting (10GB, cPanel)', sku: 'HOST-10', category: 'Hosting', billing_cycle: 'monthly', unit: 'month', price: 6, tax_rate: 0, stock: null },
  { name: 'Software License Key (1 year)', sku: 'LIC-1Y', category: 'License', billing_cycle: 'yearly', unit: 'key', price: 49, tax_rate: 0, stock: 500 },
  { name: 'Website Building — E-commerce', sku: 'WB-EC', category: 'Web Building', billing_cycle: 'one-time', unit: 'project', price: 900, tax_rate: 0, stock: null },
  { name: 'Web Maintenance (updates + backups)', sku: 'WM-STD', category: 'Web Maintenance', billing_cycle: 'monthly', unit: 'month', price: 40, tax_rate: 0, stock: null },
  { name: 'Server Maintenance (monitoring + patching)', sku: 'SM-STD', category: 'Server Maintenance', billing_cycle: 'monthly', unit: 'month', price: 60, tax_rate: 0, stock: null },
];
const items = catalog.map((c) => ({ id: itemStmt.run({ org, ...c }).lastInsertRowid, ...c }));
const byName = Object.fromEntries(items.map((i) => [i.name, i]));

// ---- Customers ----
const custStmt = db.prepare(
  `INSERT INTO customers (org_id, name, company, email, phone, city, country)
   VALUES (@org,@name,@company,@email,@phone,@city,@country)`
);
const customers = [
  { name: 'Lukas Weber', company: 'Weber Digital GmbH', email: 'lukas@weberdigital.de', phone: '+49 151 111', city: 'Munich', country: 'Germany' },
  { name: 'Sofia Rossi', company: 'Rossi Studio', email: 'sofia@rossistudio.it', phone: '+39 320 222', city: 'Milan', country: 'Italy' },
  { name: 'Aung Ko', company: 'Yangon Tech', email: 'aung@yangontech.mm', phone: '+95 9 333', city: 'Yangon', country: 'Myanmar' },
].map((c) => custStmt.run({ org, ...c }).lastInsertRowid);

// ---- Sample invoices ----
function line(name, qty) {
  const it = byName[name];
  return { item_id: it.id, description: it.name, quantity: qty, unit_price: it.price, tax_rate: it.tax_rate };
}
function makeInvoice({ customer_id, issue_date, due_date, status, lines, pay }) {
  const no = nextInvoiceNo(org, issue_date.slice(0, 4));
  const id = db.prepare(
    `INSERT INTO invoices (org_id, invoice_no, customer_id, issue_date, due_date, status, currency)
     VALUES (?,?,?,?,?,?,'EUR')`
  ).run(org, no, customer_id, issue_date, due_date, status).lastInsertRowid;
  replaceLineItems(id, lines);
  recalcInvoice(id);
  if (pay != null) {
    db.prepare(`INSERT INTO payments (org_id, invoice_id, amount, method, paid_at) VALUES (?,?,?,?,?)`)
      .run(org, id, pay, 'bank', issue_date);
    recalcInvoice(id);
  }
  return id;
}

makeInvoice({ customer_id: customers[0], issue_date: '2026-06-05', due_date: '2026-06-19', status: 'sent',
  lines: [line('VPS Pro (4 vCPU / 8GB RAM / 160GB SSD)', 1), line('Web Hosting (10GB, cPanel)', 1), line('Domain Registration (.com)', 1)] });
makeInvoice({ customer_id: customers[1], issue_date: '2026-07-01', due_date: '2026-07-15', status: 'sent',
  lines: [line('Website Building — E-commerce', 1), line('Web Maintenance (updates + backups)', 3)], pay: 1000 });
makeInvoice({ customer_id: customers[2], issue_date: '2026-07-20', due_date: '2026-08-03', status: 'sent',
  lines: [line('Software License Key (1 year)', 5), line('VPN Business (10 users)', 1)] });
makeInvoice({ customer_id: customers[0], issue_date: '2026-08-15', due_date: '2026-08-29', status: 'draft',
  lines: [line('Server Maintenance (monitoring + patching)', 1), line('VPS Basic (2 vCPU / 4GB RAM / 80GB SSD)', 2)] });

const first = db.prepare('SELECT id, total FROM invoices WHERE org_id = ? ORDER BY id LIMIT 1').get(org);
db.prepare(`INSERT INTO payments (org_id, invoice_id, amount, method, paid_at) VALUES (?,?,?,?,?)`)
  .run(org, first.id, first.total, 'bank', '2026-06-06');
recalcInvoice(first.id);

console.log('Done.');
console.log('  Login : admin@example.com / admin1234');
process.exit(0);
