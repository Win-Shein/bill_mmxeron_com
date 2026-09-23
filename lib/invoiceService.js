'use strict';

const db = require('../db/database');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Recompute an invoice's subtotal / tax / total from its line items and
 * recorded payments, then persist and return the fresh row.
 */
function recalcInvoice(invoiceId) {
  const items = db
    .prepare('SELECT * FROM invoice_items WHERE invoice_id = ?')
    .all(invoiceId);

  let subtotal = 0;
  let taxTotal = 0;
  for (const it of items) {
    const line = round2(it.quantity * it.unit_price);
    subtotal += line;
    taxTotal += round2(line * (it.tax_rate / 100));
  }

  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  if (!inv) return null;

  const discount = inv.discount || 0;
  subtotal = round2(subtotal);
  taxTotal = round2(taxTotal);
  const total = round2(Math.max(0, subtotal - discount + taxTotal));

  const paidRow = db
    .prepare('SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE invoice_id = ?')
    .get(invoiceId);
  const amountPaid = round2(paidRow.paid);

  const status = deriveStatus(inv.status, total, amountPaid, inv.due_date);

  db.prepare(
    `UPDATE invoices
       SET subtotal = ?, tax_total = ?, total = ?, amount_paid = ?, status = ?,
           updated_at = datetime('now')
     WHERE id = ?`
  ).run(subtotal, taxTotal, total, amountPaid, status, invoiceId);

  return db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
}

/**
 * Work out the status of an invoice.
 * Manual states (draft, void) are preserved unless payments push it to paid/partial.
 */
function deriveStatus(current, total, amountPaid, dueDate) {
  if (current === 'void') return 'void';

  if (amountPaid >= total && total > 0) return 'paid';
  if (amountPaid > 0 && amountPaid < total) return 'partial';

  // No payments yet.
  if (current === 'draft') return 'draft';

  if (dueDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (dueDate < today) return 'overdue';
  }
  return current === 'paid' ? 'sent' : current || 'sent';
}

/** Replace all line items for an invoice inside a transaction, then recalc. */
const replaceLineItems = db.transaction((invoiceId, lines) => {
  db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(invoiceId);
  const insert = db.prepare(
    `INSERT INTO invoice_items
       (invoice_id, item_id, description, quantity, unit_price, tax_rate, line_total, sort_order)
     VALUES (@invoice_id, @item_id, @description, @quantity, @unit_price, @tax_rate, @line_total, @sort_order)`
  );
  lines.forEach((l, idx) => {
    const quantity = Number(l.quantity) || 0;
    const unitPrice = Number(l.unit_price) || 0;
    insert.run({
      invoice_id: invoiceId,
      item_id: l.item_id || null,
      description: l.description || '',
      quantity,
      unit_price: unitPrice,
      tax_rate: Number(l.tax_rate) || 0,
      line_total: round2(quantity * unitPrice),
      sort_order: idx,
    });
  });
});

/** Reserve and return the next invoice number for an org, bumping its counter. */
const nextInvoiceNo = db.transaction((orgId) => {
  const s = db.prepare('SELECT invoice_prefix, invoice_next FROM settings WHERE org_id = ?').get(orgId);
  const no = `${s.invoice_prefix}${String(s.invoice_next).padStart(4, '0')}`;
  db.prepare('UPDATE settings SET invoice_next = invoice_next + 1 WHERE org_id = ?').run(orgId);
  return no;
});

module.exports = { round2, recalcInvoice, replaceLineItems, nextInvoiceNo, deriveStatus };
