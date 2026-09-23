'use strict';

const PDFDocument = require('pdfkit');

function money(n, symbol) {
  const v = (Number(n) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol} ${v}`;
}

/**
 * Stream a nicely formatted invoice PDF to `out` (an HTTP response or writable).
 */
function buildInvoicePdf(inv, settings, out) {
  const sym = inv.currency === settings.currency ? settings.currency_symbol : inv.currency;
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(out);

  const left = 50;
  const right = 545;
  const dark = '#1f2937';
  const muted = '#6b7280';
  const accent = '#2563eb';

  // ---- Header (optional logo on the left) ----
  let companyX = left;
  if (settings.logo_url && /^data:image\//.test(settings.logo_url)) {
    try {
      const b64 = settings.logo_url.split(',')[1];
      const buf = Buffer.from(b64, 'base64');
      doc.image(buf, left, 45, { fit: [110, 55] });
      companyX = left + 125;
    } catch (_) { /* ignore malformed logo */ }
  }
  doc.fillColor(dark).fontSize(20).font('Helvetica-Bold').text(settings.company_name, companyX, 50, { width: 210 });
  doc.font('Helvetica').fontSize(9).fillColor(muted);
  const compLines = [settings.address, [settings.city, settings.country].filter(Boolean).join(', '),
    settings.phone, settings.email, settings.tax_number ? `Tax: ${settings.tax_number}` : null]
    .filter(Boolean);
  doc.text(compLines.join('\n'), companyX, 75, { width: 210 });

  doc.fillColor(accent).font('Helvetica-Bold').fontSize(26).text('INVOICE', 350, 50, { width: 195, align: 'right' });
  doc.fillColor(dark).font('Helvetica').fontSize(10)
    .text(inv.invoice_no, 350, 82, { width: 195, align: 'right' });
  doc.fillColor(muted).fontSize(9)
    .text(`Issue: ${inv.issue_date || '-'}`, 350, 100, { width: 195, align: 'right' })
    .text(`Due:   ${inv.due_date || '-'}`, 350, 113, { width: 195, align: 'right' })
    .text(`Status: ${String(inv.status).toUpperCase()}`, 350, 126, { width: 195, align: 'right' });

  // ---- Bill To ----
  const c = inv.customer || {};
  let y = 160;
  doc.fillColor(muted).font('Helvetica-Bold').fontSize(9).text('BILL TO', left, y);
  y += 14;
  doc.fillColor(dark).font('Helvetica-Bold').fontSize(11).text(c.name || '-', left, y);
  y += 15;
  doc.font('Helvetica').fontSize(9).fillColor(muted);
  const custLines = [c.company, c.address, [c.city, c.country].filter(Boolean).join(', '),
    c.phone, c.email].filter(Boolean);
  if (custLines.length) { doc.text(custLines.join('\n'), left, y); y += custLines.length * 12; }

  // ---- Table header ----
  y = Math.max(y + 20, 250);
  const cols = { desc: left, qty: 320, price: 380, tax: 445, total: 495 };
  doc.rect(left, y, right - left, 22).fill(accent);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
  doc.text('DESCRIPTION', cols.desc + 6, y + 7);
  doc.text('QTY', cols.qty, y + 7, { width: 50, align: 'right' });
  doc.text('PRICE', cols.price, y + 7, { width: 55, align: 'right' });
  doc.text('TAX%', cols.tax, y + 7, { width: 40, align: 'right' });
  doc.text('AMOUNT', cols.total, y + 7, { width: 50, align: 'right' });
  y += 22;

  // ---- Rows ----
  doc.font('Helvetica').fontSize(9);
  (inv.items || []).forEach((it, idx) => {
    const rowH = 20;
    if (y + rowH > 720) { doc.addPage(); y = 50; }
    if (idx % 2 === 1) doc.rect(left, y, right - left, rowH).fill('#f3f4f6');
    doc.fillColor(dark);
    doc.text(it.description, cols.desc + 6, y + 6, { width: 250 });
    doc.text(String(it.quantity), cols.qty, y + 6, { width: 50, align: 'right' });
    doc.text(money(it.unit_price, sym), cols.price, y + 6, { width: 55, align: 'right' });
    doc.text(`${it.tax_rate}%`, cols.tax, y + 6, { width: 40, align: 'right' });
    doc.text(money(it.line_total, sym), cols.total, y + 6, { width: 50, align: 'right' });
    y += rowH;
  });

  doc.moveTo(left, y).lineTo(right, y).strokeColor('#e5e7eb').stroke();

  // ---- Totals ----
  y += 12;
  const labelX = 360, valX = 470, valW = 75;
  const totalRow = (label, value, bold) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9)
      .fillColor(bold ? dark : muted);
    doc.text(label, labelX, y, { width: 100, align: 'right' });
    doc.fillColor(dark).text(value, valX, y, { width: valW, align: 'right' });
    y += bold ? 18 : 15;
  };
  totalRow('Subtotal', money(inv.subtotal, sym));
  if (inv.discount) totalRow('Discount', `- ${money(inv.discount, sym)}`);
  totalRow('Tax', money(inv.tax_total, sym));
  doc.moveTo(labelX, y).lineTo(right, y).strokeColor('#e5e7eb').stroke();
  y += 6;
  totalRow('TOTAL', money(inv.total, sym), true);
  if (inv.amount_paid) {
    totalRow('Paid', `- ${money(inv.amount_paid, sym)}`);
    totalRow('Balance Due', money(inv.total - inv.amount_paid, sym), true);
  }

  // ---- Notes / terms ----
  y += 20;
  if (inv.notes) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(muted).text('Notes', left, y);
    doc.font('Helvetica').fillColor(dark).text(inv.notes, left, y + 12, { width: 300 });
    y += 40;
  }
  if (inv.terms) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(muted).text('Terms', left, y);
    doc.font('Helvetica').fillColor(dark).text(inv.terms, left, y + 12, { width: 300 });
  }

  doc.fontSize(8).fillColor(muted)
    .text('Thank you for your business.', left, 780, { align: 'center', width: right - left });

  doc.end();
}

module.exports = { buildInvoicePdf };
