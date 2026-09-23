'use strict';

const express = require('express');
const db = require('../db/database');

const router = express.Router();

// Revenue / collections over a date range grouped by month
router.get('/revenue', (req, res) => {
  const org = req.orgId;
  const from = req.query.from || '1970-01-01';
  const to = req.query.to || '2999-12-31';

  const invoiced = db
    .prepare(
      `SELECT strftime('%Y-%m', issue_date) AS month,
              COUNT(*) AS invoices, COALESCE(SUM(total),0) AS billed
         FROM invoices
        WHERE org_id = ? AND status != 'void' AND issue_date BETWEEN ? AND ?
        GROUP BY month ORDER BY month`
    )
    .all(org, from, to);

  const collected = db
    .prepare(
      `SELECT strftime('%Y-%m', paid_at) AS month, COALESCE(SUM(amount),0) AS collected
         FROM payments WHERE org_id = ? AND paid_at BETWEEN ? AND ?
        GROUP BY month ORDER BY month`
    )
    .all(org, from, to);

  res.json({ from, to, invoiced, collected });
});

// Outstanding / receivables aging (optional issue-date range filter)
router.get('/aging', (req, res) => {
  const org = req.orgId;
  const from = req.query.from || '1970-01-01';
  const to = req.query.to || '2999-12-31';
  const rows = db
    .prepare(
      `SELECT i.id, i.invoice_no, i.issue_date, i.due_date, i.total, i.amount_paid,
              (i.total - i.amount_paid) AS balance, c.name AS customer_name,
              CAST(julianday('now') - julianday(i.due_date) AS INTEGER) AS days_overdue
         FROM invoices i JOIN customers c ON c.id = i.customer_id
        WHERE i.org_id = ? AND i.status NOT IN ('paid','void') AND (i.total - i.amount_paid) > 0
          AND i.issue_date BETWEEN ? AND ?
        ORDER BY i.due_date`
    )
    .all(org, from, to);

  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
  for (const r of rows) {
    const d = r.days_overdue || 0;
    if (d <= 0) buckets.current += r.balance;
    else if (d <= 30) buckets.d1_30 += r.balance;
    else if (d <= 60) buckets.d31_60 += r.balance;
    else if (d <= 90) buckets.d61_90 += r.balance;
    else buckets.d90_plus += r.balance;
  }
  res.json({ rows, buckets });
});

// Monthly summary — billed / collected / outstanding per month
router.get('/monthly', (req, res) => {
  const org = req.orgId;
  const from = req.query.from || '1970-01-01';
  const to = req.query.to || '2999-12-31';
  const rows = db
    .prepare(
      `SELECT strftime('%Y-%m', issue_date) AS month,
              COUNT(*) AS invoices,
              COALESCE(SUM(total),0) AS billed,
              COALESCE(SUM(amount_paid),0) AS collected,
              COALESCE(SUM(total - amount_paid),0) AS outstanding
         FROM invoices
        WHERE org_id = ? AND status != 'void' AND issue_date BETWEEN ? AND ?
        GROUP BY month ORDER BY month DESC`
    )
    .all(org, from, to);
  const totals = rows.reduce(
    (a, r) => ({
      invoices: a.invoices + r.invoices,
      billed: a.billed + r.billed,
      collected: a.collected + r.collected,
      outstanding: a.outstanding + r.outstanding,
    }),
    { invoices: 0, billed: 0, collected: 0, outstanding: 0 }
  );
  res.json({ from, to, rows, totals });
});

// Sales by item
router.get('/by-item', (req, res) => {
  const rows = db
    .prepare(
      `SELECT COALESCE(it.name, ii.description) AS name,
              SUM(ii.quantity) AS qty,
              SUM(ii.line_total) AS revenue
         FROM invoice_items ii
         JOIN invoices i ON i.id = ii.invoice_id AND i.status != 'void' AND i.org_id = ?
         LEFT JOIN items it ON it.id = ii.item_id
        GROUP BY name ORDER BY revenue DESC LIMIT 50`
    )
    .all(req.orgId);
  res.json(rows);
});

module.exports = router;
