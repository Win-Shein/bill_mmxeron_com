'use strict';

const express = require('express');
const db = require('../db/database');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM settings WHERE org_id = ?').get(req.orgId));
});

router.put('/', (req, res) => {
  const cur = db.prepare('SELECT * FROM settings WHERE org_id = ?').get(req.orgId);
  const b = req.body;
  db.prepare(
    `UPDATE settings SET
       company_name=@company_name, email=@email, phone=@phone, address=@address,
       city=@city, country=@country, tax_number=@tax_number, currency=@currency,
       currency_symbol=@currency_symbol, default_tax=@default_tax, invoice_prefix=@invoice_prefix,
       invoice_next=@invoice_next, language=@language, logo_url=@logo_url, notes=@notes,
       updated_at=datetime('now')
     WHERE org_id = @org`
  ).run({
    org: req.orgId,
    company_name: b.company_name ?? cur.company_name,
    email: b.email ?? cur.email,
    phone: b.phone ?? cur.phone,
    address: b.address ?? cur.address,
    city: b.city ?? cur.city,
    country: b.country ?? cur.country,
    tax_number: b.tax_number ?? cur.tax_number,
    currency: b.currency ?? cur.currency,
    currency_symbol: b.currency_symbol ?? cur.currency_symbol,
    default_tax: b.default_tax != null ? Number(b.default_tax) : cur.default_tax,
    invoice_prefix: b.invoice_prefix ?? cur.invoice_prefix,
    invoice_next: b.invoice_next != null ? Number(b.invoice_next) : cur.invoice_next,
    language: b.language ?? cur.language,
    logo_url: b.logo_url ?? cur.logo_url,
    notes: b.notes ?? cur.notes,
  });
  res.json(db.prepare('SELECT * FROM settings WHERE org_id = ?').get(req.orgId));
});

module.exports = router;
