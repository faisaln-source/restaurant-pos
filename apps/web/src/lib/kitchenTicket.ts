/**
 * kitchenTicket.ts
 * Generates an 80mm-style kitchen docket and opens the system print dialog.
 * Content is rendered at the correct width so it aligns on any printer.
 */
import type { Order, Payment } from './types';
import { openExternalUrl } from './tauri';

export interface PrintKitchenTicketOptions {
  restaurantName?: string;
  copy?: string;
  /** When set, only items whose kitchenStationId matches this value are printed. */
  stationId?: string | null;
  /** Human-readable station name shown on the ticket header copy badge. */
  stationName?: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtTime(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtDateTime(iso?: string | null) {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function typeLabel(t: string) {
  return ({ DINE_IN: 'DINE IN', TAKEAWAY: 'TAKEAWAY', DELIVERY: 'DELIVERY' }[t] ?? t);
}

// ── shared popup helper ───────────────────────────────────────────────────────
function openPrintWindow(html: string) {
  const win = window.open('', '_blank', 'width=302,height=700,toolbar=0,menubar=0,scrollbars=0,status=0');
  if (!win) {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:none;';
    document.body.appendChild(iframe);
    iframe.contentDocument?.write(html);
    iframe.contentDocument?.close();
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => document.body.removeChild(iframe), 3000);
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  const doPrint = () => { win.print(); setTimeout(() => win.close(), 600); };
  win.onload = doPrint;
  setTimeout(() => { if (!win.closed) doPrint(); }, 900);
}

// ── build kitchen ticket HTML ─────────────────────────────────────────────────
function buildTicketHtml(order: Order, restName: string, copy: string, stationId?: string | null): string {
  // When stationId is provided, only print items for that station.
  // Unrouted items (kitchenStationId === null) are included in "All Kitchens" prints only.
  const active = order.items.filter(i => {
    if (i.status === 'CANCELLED') return false;
    if (stationId) return (i as any).kitchenStationId === stationId;
    return true;
  });

  // Nothing to print for this station — bail out silently
  if (active.length === 0) return '';

  const itemRows = active.map(item => `
    <tr>
      <td class="qty">${item.quantity}&times;</td>
      <td class="name">${esc(item.menuItemName || 'Item')}</td>
    </tr>
    ${item.note ? `<tr><td></td><td class="note">&#8627;&nbsp;${esc(item.note)}</td></tr>` : ''}
  `).join('');

  const metaRow = (label: string, val: string) =>
    `<tr><td class="ml">${esc(label)}</td><td class="mv">${esc(val)}</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Kitchen Ticket #${order.orderNumber}</title>
<style>
  /* ── Page: 80mm thermal receipt size ── */
  @page {
    size: 80mm auto;
    margin: 0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 13px;
    color: #000;
    background: #fff;
    /* Fill exactly the 80mm page width */
    width: 80mm;
    margin: 0;
    padding: 4mm;
  }

  /* ── Horizontal rules ── */
  .rule-thick { border: none; border-top: 2.5px solid #000; margin: 5px 0; }
  .rule-dash  { border: none; border-top: 1px  dashed #888; margin: 5px 0; }

  /* ── Header ── */
  .hdr        { text-align: center; padding-bottom: 5px; }
  .rest       { font-size: 18px; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; }
  .badge-copy {
    display: inline-block; margin-top: 4px;
    font-size: 9px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase;
    background: #000; color: #fff; padding: 2px 12px;
  }

  /* ── Ticket number ── */
  .tnum {
    text-align: center;
    font-size: 28px; font-weight: 900;
    letter-spacing: -.01em;
    padding: 5px 0;
  }

  /* ── Meta grid ── */
  .meta { width: 100%; border-collapse: collapse; font-size: 12px; margin: 4px 0; }
  .meta td { padding: 2px 0; vertical-align: top; }
  .ml   { color: #555; white-space: nowrap; padding-right: 6px; width: 1%; }
  .mv   { font-weight: 700; }

  /* type + time row */
  .tr-type td { padding-bottom: 5px; }
  .type-badge {
    display: inline-block; white-space: nowrap;
    font-size: 11px; font-weight: 900;
    border: 2px solid #000; padding: 1px 7px;
    letter-spacing: .05em; text-transform: uppercase;
  }
  .col-time { text-align: right; font-weight: 700; white-space: nowrap; }

  /* ── Items ── */
  .lbl-items {
    font-size: 9px; font-weight: 700;
    letter-spacing: .14em; text-transform: uppercase;
    color: #666; margin-bottom: 3px;
  }
  .items { width: 100%; border-collapse: collapse; }
  .items td { padding: 3px 0; vertical-align: top; }
  .qty  { font-size: 15px; font-weight: 900; color: #b45309; white-space: nowrap; padding-right: 8px; width: 1%; }
  .name { font-size: 14px; font-weight: 700; line-height: 1.25; word-break: break-word; }
  .note { font-size: 10px; font-style: italic; color: #444; padding-bottom: 2px; line-height: 1.3; }

  /* ── Order note ── */
  .order-note {
    border-left: 3px solid #000; background: #f4f4f4;
    padding: 3px 7px; margin: 4px 0;
    font-size: 11px; font-weight: 700; word-break: break-word;
  }

  /* ── Footer ── */
  .footer { text-align: center; font-size: 9px; color: #999; padding-top: 4px; }

  @media print {
    body { margin: 0 auto; }
  }
</style>
</head>
<body>

<div class="hdr">
  <div class="rest">${esc(restName)}</div>
  <div class="badge-copy">${esc(copy)}</div>
</div>
<hr class="rule-thick"/>

<div class="tnum">Ticket&nbsp;#${order.orderNumber}</div>
<hr class="rule-thick"/>

<table class="meta">
  <tr class="tr-type">
    <td><span class="type-badge">${typeLabel(order.type)}</span></td>
    <td class="col-time">${fmtTime(order.createdAt)}</td>
  </tr>
  ${order.tableName    ? metaRow('Table:',    order.tableName)    : ''}
  ${order.customerName ? metaRow('Customer:', order.customerName) : ''}
  ${order.userName     ? metaRow('Staff:',    order.userName)     : ''}
</table>
<hr class="rule-thick"/>

<div class="lbl-items">Items</div>
<table class="items">
  ${itemRows}
</table>

${order.note ? `<hr class="rule-dash"/><div class="order-note">&#9888;&nbsp;${esc(order.note)}</div>` : ''}

<hr class="rule-dash"/>
<div class="footer">Printed: ${fmtDateTime(new Date().toISOString())}</div>

</body>
</html>`;
}

// ── print entry point ────────────────────────────────────────────────────────
export function printKitchenTicket(order: Order, opts: PrintKitchenTicketOptions = {}): void {
  const restName = opts.restaurantName ?? (() => {
    try {
      const s = localStorage.getItem('pos_settings');
      return s ? (JSON.parse(s) as any).restaurantName ?? 'Restaurant' : 'Restaurant';
    } catch { return 'Restaurant'; }
  })();

  // Build copy label: e.g. "JUICE BAR — KITCHEN COPY" or just "KITCHEN COPY"
  const copyLabel = opts.stationName
    ? `${opts.stationName.toUpperCase()} - KITCHEN COPY`
    : (opts.copy ?? 'KITCHEN COPY');

  const html = buildTicketHtml(order, restName, copyLabel, opts.stationId);

  // Nothing to print (no items for this station)
  if (!html) return;

  openPrintWindow(html);
}

// ── Seat / Split Bill print ───────────────────────────────────────────────────
export interface SeatBillItem {
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

export function printSeatBill(opts: {
  items: SeatBillItem[];
  seatNumber: number;
  tableName?: string;
  restName?: string;
  sub: number;
  tax: number;
  total: number;
}): void {
  const { items, seatNumber, tableName, restName = 'Restaurant', sub, tax, total } = opts;

  const rows = items.map(i => `
    <tr>
      <td class="qty">${i.quantity}&times;</td>
      <td class="name">${esc(i.name)}</td>
      <td class="price">&#8377;${(i.unitPrice * i.quantity).toFixed(2)}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Seat ${seatNumber} Bill</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', monospace; font-size: 13px; color: #000; background: #fff; width: 80mm; padding: 4mm; }
  .rule-thick { border: none; border-top: 2.5px solid #000; margin: 5px 0; }
  .rule-dash  { border: none; border-top: 1px dashed #888; margin: 5px 0; }
  .hdr { text-align: center; padding-bottom: 4px; }
  .rest { font-size: 16px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
  .badge { display: inline-block; margin-top: 3px; font-size: 9px; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; background: #000; color: #fff; padding: 2px 10px; }
  .seat-num { text-align: center; font-size: 26px; font-weight: 900; padding: 5px 0; }
  .meta { font-size: 11px; padding: 3px 0; }
  .items { width: 100%; border-collapse: collapse; margin: 4px 0; }
  .items td { padding: 3px 0; vertical-align: top; }
  .qty   { font-size: 14px; font-weight: 900; color: #b45309; white-space: nowrap; padding-right: 6px; width: 1%; }
  .name  { font-size: 13px; font-weight: 700; word-break: break-word; }
  .price { font-size: 13px; font-weight: 700; text-align: right; white-space: nowrap; padding-left: 4px; }
  .totals { width: 100%; border-collapse: collapse; font-size: 12px; margin: 4px 0; }
  .totals td { padding: 1.5px 0; }
  .tl { color: #555; }
  .tv { font-weight: 700; text-align: right; font-family: monospace; }
  .grand td { font-size: 14px; font-weight: 900; border-top: 2px solid #000; padding-top: 4px; }
  .footer { text-align: center; font-size: 9px; color: #999; padding-top: 4px; }
  @media print { body { margin: 0 auto; } }
</style>
</head>
<body>
<div class="hdr">
  <div class="rest">${esc(restName)}</div>
  <div class="badge">SEAT ${seatNumber} BILL</div>
</div>
<hr class="rule-thick"/>
<div class="seat-num">Seat&nbsp;${seatNumber}</div>
<hr class="rule-thick"/>
${tableName ? `<div class="meta">Table: <strong>${esc(tableName)}</strong></div>` : ''}
<div class="meta">Date: ${new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</div>
<hr class="rule-dash"/>
<table class="items">
  <tr><td colspan="3" style="font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#666;padding-bottom:3px;">Items</td></tr>
  ${rows}
</table>
<hr class="rule-dash"/>
<table class="totals">
  <tr><td class="tl">Subtotal</td><td class="tv">&#8377;${sub.toFixed(2)}</td></tr>
  <tr><td class="tl">Tax (5%)</td><td class="tv">&#8377;${tax.toFixed(2)}</td></tr>
  <tr class="grand"><td>TOTAL</td><td class="tv">&#8377;${total.toFixed(2)}</td></tr>
</table>
<hr class="rule-dash"/>
<div class="footer">Thank you! Please visit again &#10084;</div>
</body>
</html>`;

  openPrintWindow(html);
}

// ── WhatsApp share ────────────────────────────────────────────────────────────
/**
 * Build a beautifully formatted WhatsApp bill message matching the receipt and open wa.me chat.
 * @param order   Order to share
 * @param phone   Customer phone — digits only, with or without country code.
 * @param restName Optional custom restaurant name
 * @param payment Optional payment details (method, status, tip, change)
 */
export async function shareOrderOnWhatsApp(
  order: Order,
  phone: string,
  restName?: string,
  payment?: Partial<Payment> | null,
): Promise<void> {
  // Normalise phone number
  let num = (phone || '').replace(/\D/g, '');
  if (num.length === 10) num = '91' + num;          // default India country code for 10 digits
  if (num.startsWith('+')) num = num.slice(1);

  // Settings lookup
  let savedSettings: any = {};
  try {
    const s = localStorage.getItem('pos_settings');
    if (s) savedSettings = JSON.parse(s);
  } catch { /* use defaults */ }

  const restaurant = (restName || savedSettings.restaurantName || 'RestoPOS').trim();
  const currency = savedSettings.currency || '₹';
  const address = (savedSettings.address || 'Restaurant & Bar').trim();
  const phoneContact = savedSettings.phone ? savedSettings.phone.trim() : '';

  const fmt = (n: number | string | undefined | null) => {
    const numVal = Number(n);
    return `${currency}${(!isNaN(numVal) ? numVal : 0).toFixed(2)}`;
  };

  const rawDate = order.createdAt ? new Date(order.createdAt) : new Date();
  const dateStr = !isNaN(rawDate.getTime())
    ? rawDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN');
  const timeStr = !isNaN(rawDate.getTime())
    ? rawDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
    : '';

  const typeMap: Record<string, string> = {
    DINE_IN: 'Dine In',
    TAKEAWAY: 'Takeaway',
    DELIVERY: 'Delivery',
    BAR: 'Counter / Bar',
  };
  const typeLabelStr = typeMap[order.type] || (order.type ? order.type.replace('_', ' ') : 'Dine In');
  const tableName = order.tableName || (order as any).table?.name || null;
  const serverName = order.userName || (order as any).user?.name || null;
  const customerName = order.customerName?.trim() || null;

  // Filter active items
  const activeItems = (order.items || []).filter(i => i && i.status !== 'CANCELLED');

  // Financial calculations with safe defaults
  const subtotal = Number(order.subtotal) != null && !isNaN(Number(order.subtotal))
    ? Number(order.subtotal)
    : activeItems.reduce((acc, it) => acc + (Number(it.totalPrice) || 0), 0);

  const taxAmount = Number(order.taxAmount) != null && !isNaN(Number(order.taxAmount))
    ? Number(order.taxAmount)
    : 0;

  const taxRate = order.taxRate != null && !isNaN(Number(order.taxRate))
    ? Number(order.taxRate)
    : (subtotal > 0 && taxAmount > 0 ? Math.round((taxAmount / subtotal) * 100) : (savedSettings.taxRate ?? 5));

  const discountAmount = Number(order.discountAmount) || 0;
  const extraCharges = Number(order.extraCharges) || 0;
  const tipAmount = Number(payment?.tip) || 0;
  const totalAmount = Number(order.totalAmount) != null && !isNaN(Number(order.totalAmount))
    ? Number(order.totalAmount)
    : (subtotal + taxAmount + extraCharges - discountAmount);

  const grandFinal = (payment?.amount != null && !isNaN(Number(payment.amount)))
    ? Number(payment.amount)
    : totalAmount;

  // Receipt formatting matching the on-screen simulated receipt
  const w = 32;
  const sep = '-'.repeat(w);
  const dsep = '='.repeat(w);

  const center = (s: string) => {
    const pad = Math.max(0, Math.floor((w - s.length) / 2));
    return ' '.repeat(pad) + s;
  };

  const lr = (left: string, right: string) => {
    const spaces = Math.max(1, w - left.length - right.length);
    return left + ' '.repeat(spaces) + right;
  };

  const receiptLines: string[] = [];
  receiptLines.push(dsep);
  receiptLines.push(center(restaurant.toUpperCase()));
  if (address) receiptLines.push(center(address));
  if (phoneContact) receiptLines.push(center(`Tel: ${phoneContact}`));
  receiptLines.push(sep);

  receiptLines.push(lr(`Order #${order.orderNumber}`, timeStr || ''));
  receiptLines.push(lr(dateStr, typeLabelStr));
  if (tableName || serverName) {
    const left = tableName ? `Table: ${tableName}` : '';
    const right = serverName ? `Server: ${serverName}` : '';
    receiptLines.push(lr(left, right));
  }
  if (customerName) {
    receiptLines.push(lr('Customer:', customerName));
  }
  receiptLines.push(sep);
  receiptLines.push(lr('ITEM', 'QTY       AMT'));
  receiptLines.push(sep);

  for (const item of activeItems) {
    const name = item.menuItemName || (item as any).menuItem?.name || (item as any).name || 'Dish Item';
    const qty = Number(item.quantity) || 1;
    const lineTotal = Number(item.totalPrice) != null && !isNaN(Number(item.totalPrice))
      ? Number(item.totalPrice)
      : (Number(item.unitPrice) || 0) * qty;

    const qtyAmt = `x${qty}  ${fmt(lineTotal)}`;
    if (name.length + qtyAmt.length + 1 <= w) {
      receiptLines.push(lr(name, qtyAmt));
    } else {
      receiptLines.push(name);
      receiptLines.push(lr('', qtyAmt));
    }
    if (item.note) {
      receiptLines.push(` (${item.note})`);
    }
  }

  receiptLines.push(sep);
  receiptLines.push(lr('Subtotal', fmt(subtotal)));
  receiptLines.push(lr(`Tax (${taxRate}%)`, fmt(taxAmount)));

  if (order.extraChargesDetail && Array.isArray(order.extraChargesDetail) && order.extraChargesDetail.length > 0) {
    for (const ec of order.extraChargesDetail) {
      receiptLines.push(lr(ec.label || 'Extra Charge', fmt(ec.amount)));
    }
  } else if (extraCharges > 0) {
    receiptLines.push(lr('Extra Charges', fmt(extraCharges)));
  }

  if (discountAmount > 0) {
    receiptLines.push(lr('Discount', `-${fmt(discountAmount)}`));
  }
  if (tipAmount > 0) {
    receiptLines.push(lr('Tip', fmt(tipAmount)));
  }

  receiptLines.push(dsep);
  receiptLines.push(lr('TOTAL', fmt(grandFinal)));
  receiptLines.push(dsep);

  const payMethod = payment?.method || (order as any).payment?.method || null;
  const payStatus = payment?.status || (order as any).payment?.status || (order.status === 'COMPLETED' ? 'COMPLETED' : null);

  if (payMethod || payStatus) {
    receiptLines.push(lr(`Method: ${payMethod || 'UPI'}`, payStatus || 'PAID'));
    if (payment?.change && Number(payment.change) > 0) {
      receiptLines.push(lr('Change Returned', fmt(payment.change)));
    }
    if (payment?.reference) {
      receiptLines.push(lr('Ref:', String(payment.reference).slice(0, 18)));
    }
    receiptLines.push(sep);
  }

  receiptLines.push(center('Thank you for dining with us!'));
  receiptLines.push(center('Please visit again ❤️'));
  receiptLines.push(center('Powered by RestoPOS'));
  receiptLines.push(dsep);

  const fullMessage = [
    `🧾 *TAX RECEIPT — #${order.orderNumber}*`,
    `*${restaurant}*`,
    '```',
    receiptLines.join('\n'),
    '```',
  ].join('\n');

  const encodedText = encodeURIComponent(fullMessage);
  const waUrl = num ? `https://wa.me/${num}?text=${encodedText}` : `https://wa.me/?text=${encodedText}`;

  await openExternalUrl(waUrl);
}
