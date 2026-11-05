/**
 * kitchenTicket.ts
 * Generates an 80mm-style kitchen docket and opens the system print dialog.
 * Content is rendered at the correct width so it aligns on any printer.
 */
import type { Order } from './types';

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
 * Build a nicely formatted WhatsApp bill message and open the wa.me chat.
 * @param phone  Customer phone — digits only, with or without country code.
 *               If no country code, 91 (India) is prepended.
 */
export function shareOrderOnWhatsApp(order: Order, phone: string, restName?: string): void {
  // Normalise phone number
  let num = phone.replace(/\D/g, '');
  if (num.length === 10) num = '91' + num;          // add India code
  if (!num.startsWith('+')) num = '+' + num;

  const restaurant = restName ?? (() => {
    try {
      const s = localStorage.getItem('pos_settings');
      return s ? (JSON.parse(s) as any).restaurantName ?? 'Restaurant' : 'Restaurant';
    } catch { return 'Restaurant'; }
  })();

  const currency = (() => {
    try {
      const s = localStorage.getItem('pos_settings');
      return s ? (JSON.parse(s) as any).currency ?? '₹' : '₹';
    } catch { return '₹'; }
  })();

  const fmt = (n: number) => `${currency}${n.toFixed(2)}`;
  const date = order.createdAt
    ? new Date(order.createdAt).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
      })
    : new Date().toLocaleString('en-IN');

  const active = order.items.filter(i => i.status !== 'CANCELLED');
  const itemLines = active.map(i => `  • ${i.quantity}× ${i.menuItemName}${i.note ? ` _(${i.note})_` : ''}`).join('\n');

  const typeLabel2 = ({ DINE_IN: 'Dine In', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' }[order.type] ?? order.type);

  const lines: string[] = [
    `🍽️ *${restaurant}*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🎫 *Order #${order.orderNumber}*`,
    `📅 ${date}`,
    `🍴 ${typeLabel2}${order.tableName ? ` — Table ${order.tableName}` : ''}`,
    order.customerName ? `👤 ${order.customerName}` : '',
    `━━━━━━━━━━━━━━━━━━━━`,
    `*Items:*`,
    itemLines,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Subtotal:  ${fmt(order.subtotal)}`,
    `Tax (${order.taxRate}%): ${fmt(order.taxAmount)}`,
    order.discountAmount > 0 ? `Discount:  -${fmt(order.discountAmount)}` : '',
    `*Total:    ${fmt(order.totalAmount)}*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `_Thank you for dining with us! 🙏_`,
    `_Please visit again ❤️_`,
  ].filter(Boolean);

  const text = encodeURIComponent(lines.join('\n'));
  window.open(`https://wa.me/${num.replace('+', '')}?text=${text}`, '_blank', 'noopener,noreferrer');
}
