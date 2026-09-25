'use strict';

const express = require('express');
const db = require('../db/database');
const { listRenewals } = require('../lib/renewals');

const router = express.Router();

router.get('/', (req, res) => {
  const org = req.orgId;
  const today = new Date().toISOString().slice(0, 10);

  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(total),0)               AS total_billed,
         COALESCE(SUM(amount_paid),0)         AS total_collected,
         COALESCE(SUM(total - amount_paid),0) AS outstanding,
         COUNT(*)                             AS invoice_count
       FROM invoices WHERE org_id = ? AND status != 'void'`
    )
    .get(org);

  const overdue = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(total - amount_paid),0) AS amount
         FROM invoices
        WHERE org_id = ? AND status != 'void' AND status != 'paid'
          AND due_date IS NOT NULL AND due_date < ? AND (total - amount_paid) > 0`
    )
    .get(org, today);

  const byStatus = db
    .prepare(`SELECT status, COUNT(*) AS n, COALESCE(SUM(total),0) AS amount FROM invoices WHERE org_id = ? GROUP BY status`)
    .all(org);

  const counts = {
    customers: db.prepare('SELECT COUNT(*) AS n FROM customers WHERE org_id = ?').get(org).n,
    items: db.prepare('SELECT COUNT(*) AS n FROM items WHERE org_id = ?').get(org).n,
  };

  const monthly = db
    .prepare(
      `SELECT strftime('%Y-%m', paid_at) AS month, COALESCE(SUM(amount),0) AS collected
         FROM payments
        WHERE org_id = ? AND paid_at >= date('now','-5 months','start of month')
        GROUP BY month ORDER BY month`
    )
    .all(org);

  const recentInvoices = db
    .prepare(
      `SELECT i.id, i.invoice_no, i.total, i.status, i.issue_date, i.amount_paid, c.name AS customer_name
         FROM invoices i JOIN customers c ON c.id = i.customer_id
        WHERE i.org_id = ?
        ORDER BY i.created_at DESC LIMIT 8`
    )
    .all(org);

  const topCustomers = db
    .prepare(
      `SELECT c.id, c.name, COALESCE(SUM(i.total),0) AS billed
         FROM customers c JOIN invoices i ON i.customer_id = c.id AND i.status != 'void'
        WHERE c.org_id = ?
        GROUP BY c.id ORDER BY billed DESC LIMIT 5`
    )
    .all(org);

  const renewals = listRenewals(org);

  res.json({ totals, overdue, byStatus, counts, monthly, recentInvoices, topCustomers, renewals });
});

module.exports = router;
