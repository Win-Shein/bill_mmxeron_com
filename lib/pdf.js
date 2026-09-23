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
      const img = doc.openImage(buf);
      const scale = Math.min(110 / img.width, 55 / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      doc.image(img, left, 45, { width: w, height: h });
      companyX = left + w + 12;   // place company name right next to the logo
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

  // ---- Table (columns sized to fit the currency symbol) ----
  y = Math.max(y + 20, 250);

  const amounts = (inv.items || []).flatMap((it) => [money(it.unit_price, sym), money(it.line_total, sym)]);
  const numW = Math.max(doc.widthOfString('AMOUNT'), ...amounts.map((s) => doc.widthOfString(s))) + 10;

  const totalW = numW;
  const taxW = 40;
  const qtyW = 30;
  const priceW = numW;
  const totalX = right - totalW;
  const taxX = totalX - taxW;
  const priceX = taxX - priceW;
  const qtyX = priceX - qtyW;
  const descX = left;
  const descW = qtyX - 6 - descX;

  doc.rect(left, y, right - left, 22).fill(accent);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
  doc.text('DESCRIPTION', descX + 6, y + 7, { width: descW });
  doc.text('QTY', qtyX, y + 7, { width: qtyW, align: 'right' });
  doc.text('PRICE', priceX, y + 7, { width: priceW, align: 'right' });
  doc.text('TAX%', taxX, y + 7, { width: taxW, align: 'right' });
  doc.text('AMOUNT', totalX, y + 7, { width: totalW, align: 'right' });
  y += 22;

  // ---- Rows ----
  doc.font('Helvetica').fontSize(9);
  (inv.items || []).forEach((it, idx) => {
    const lines = Math.max(1, Math.ceil(doc.widthOfString(it.description) / (descW - 2)));
    const rowH = Math.max(20, lines * 11 + 8);
    if (y + rowH > 720) { doc.addPage(); y = 50; }
    if (idx % 2 === 1) doc.rect(left, y, right - left, rowH).fill('#f3f4f6');
    doc.fillColor(dark);
    doc.text(it.description, descX + 6, y + 6, { width: descW - 2 });
    doc.text(String(it.quantity), qtyX, y + 6, { width: qtyW, align: 'right' });
    doc.text(money(it.unit_price, sym), priceX, y + 6, { width: priceW, align: 'right' });
    doc.text(`${it.tax_rate}%`, taxX, y + 6, { width: taxW, align: 'right' });
    doc.text(money(it.line_total, sym), totalX, y + 6, { width: totalW, align: 'right' });
    y += rowH;
  });

  doc.moveTo(left, y).lineTo(right, y).strokeColor('#e5e7eb').stroke();

  // ---- Totals ----
  y += 12;
  const labelX = 330, labelW = 100, valX = 435, valW = right - valX;
  const totalRow = (label, value, bold) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9)
      .fillColor(bold ? dark : muted);
    doc.text(label, labelX, y, { width: labelW, align: 'right' });
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
