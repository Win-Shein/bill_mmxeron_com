'use strict';

/**
 * Renewal / expiry tracking for subscription-style line items (VPS, Domain,
 * Hosting, License, ...). Each invoice line can carry its own service term
 * (`service_start` / `service_end`); the line with the latest `service_end`
 * per customer + product represents the currently active subscription.
 *
 * Drafts, cancelled invoices and Stornorechnungen (credit notes) are ignored
 * so only genuinely billed services show up as renewals.
 */
const db = require('../db/database');

const listStmt = db.prepare(
  `SELECT t.customer_id, t.customer_name, t.item_id, t.description, t.category,
          t.expires_at,
          CAST(julianday(t.expires_at) - julianday('now') AS INTEGER) AS days_left
     FROM (
       SELECT i.customer_id                              AS customer_id,
              c.name                                     AS customer_name,
              ii.item_id                                 AS item_id,
              ii.description                             AS description,
              ii.category                                AS category,
              MAX(ii.service_end)                        AS expires_at
         FROM invoice_items ii
         JOIN invoices  i ON i.id = ii.invoice_id
         JOIN customers c ON c.id = i.customer_id
        WHERE i.org_id = @org
          AND ii.service_end IS NOT NULL AND ii.service_end <> ''
          AND i.status NOT IN ('draft', 'cancelled', 'void')
          AND i.original_invoice_id IS NULL
        GROUP BY i.customer_id, COALESCE(ii.item_id, ii.description), ii.description
     ) t
    ORDER BY t.expires_at ASC`
);

/** List the active subscription expiries for an org, soonest first. */
function listRenewals(orgId) {
  return listStmt.all({ org: orgId });
}

module.exports = { listRenewals };
