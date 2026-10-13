import { Printer, Download, Receipt as ReceiptIcon } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { Order, Payment } from '../lib/types';

interface Props {
  order: Order;
  payment?: Payment | null;
  onClose: () => void;
}

export default function ReceiptModal({ order, payment, onClose }: Props) {
  const now = new Date();
  const orderDate = order.createdAt ? new Date(order.createdAt) : now;

  const handlePrint = () => {
    const printWin = window.open('', '_blank', 'width=794,height=1123');
    if (!printWin) {
      alert('Pop-up blocked — please allow pop-ups to print receipts.');
      return;
    }

    const taxLabel = order.taxRate ? `${order.taxRate}%` : '';

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Receipt #${order.orderNumber}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap');
            @page { size: A4; margin: 20mm 25mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: 'Inter', sans-serif;
              font-size: 13px;
              color: #1a1a1a;
              background: #fff;
              max-width: 580px;
              margin: 0 auto;
              padding: 32px 0;
            }

            /* ── Header ── */
            .header { text-align: center; margin-bottom: 24px; }
            .shop-name {
              font-size: 28px; font-weight: 900;
              letter-spacing: 0.08em; text-transform: uppercase;
              color: #111;
            }
            .shop-sub { font-size: 13px; color: #555; margin-top: 2px; }
            .shop-addr { font-size: 11px; color: #888; margin-top: 3px; }

            /* ── Divider ── */
            .sep { border: none; border-top: 1px dashed #bbb; margin: 14px 0; }
            .sep-solid { border: none; border-top: 2px solid #222; margin: 14px 0; }

            /* ── Meta rows ── */
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 0; font-size: 12px; }
            .meta-label { color: #666; }
            .meta-value { text-align: right; font-weight: 600; color: #111; }

            /* ── Items table ── */
            .items-header {
              display: grid;
              grid-template-columns: 1fr 60px 90px;
              font-size: 11px; font-weight: 700;
              text-transform: uppercase; letter-spacing: 0.06em;
              color: #444;
              padding: 6px 0;
              border-bottom: 1px solid #ccc;
            }
            .item-row {
              display: grid;
              grid-template-columns: 1fr 60px 90px;
              padding: 7px 0;
              border-bottom: 1px dashed #eee;
              font-size: 13px;
              align-items: center;
            }
            .item-name { color: #111; font-weight: 500; }
            .item-qty  { text-align: center; color: #555; font-weight: 600; }
            .item-amt  { text-align: right; font-weight: 600; color: #111; }

            /* ── Totals ── */
            .totals { margin-top: 4px; }
            .total-row {
              display: flex; justify-content: space-between;
              padding: 4px 0; font-size: 13px;
            }
            .total-label { color: #555; }
            .total-value { font-weight: 600; color: #111; }
            .grand-row {
              display: flex; justify-content: space-between;
              padding: 10px 0 6px; margin-top: 6px;
              border-top: 2px solid #111;
              font-size: 20px; font-weight: 900;
            }
            .grand-amount { color: #ea580c; }

            /* ── Payment info ── */
            .payment-info {
              margin-top: 2px; font-size: 12px;
            }
            .payment-row {
              display: flex; justify-content: space-between;
              padding: 3px 0;
            }
            .payment-label { color: #666; }
            .paid-badge { color: #16a34a; font-weight: 700; font-size: 13px; }

            /* ── Footer ── */
            .footer {
              text-align: center; margin-top: 28px;
              padding-top: 14px; border-top: 1px dashed #bbb;
              color: #666;
            }
            .footer-thanks { font-size: 15px; font-weight: 700; color: #111; }
            .footer-sub { font-size: 12px; margin-top: 3px; }
            .footer-powered { font-size: 10px; color: #bbb; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="shop-name">RESTRO POS</div>
            <div class="shop-sub">Restaurant &amp; Bar</div>
            <div class="shop-addr">123 Food Street, City &bull; +91 98765 43210 &bull; GSTIN: 29AABCU9603R1ZX</div>
          </div>

          <hr class="sep-solid" />

          <div class="meta">
            <span class="meta-label">Receipt No.</span>
            <span class="meta-value">#${order.orderNumber}</span>

            <span class="meta-label">Date</span>
            <span class="meta-value">${orderDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>

            <span class="meta-label">Time</span>
            <span class="meta-value">${orderDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>

            <span class="meta-label">Order Type</span>
            <span class="meta-value">${order.type.replace('_', ' ')}</span>

            ${order.tableName ? `
            <span class="meta-label">Table</span>
            <span class="meta-value">${order.tableName}</span>
            ` : ''}

            ${order.userName ? `
            <span class="meta-label">Server</span>
            <span class="meta-value">${order.userName}</span>
            ` : ''}

            ${order.customerName ? `
            <span class="meta-label">Customer</span>
            <span class="meta-value">${order.customerName}</span>
            ` : ''}
          </div>

          <hr class="sep" />

          <div class="items-header">
            <span>ITEM</span>
            <span style="text-align:center">QTY</span>
            <span style="text-align:right">AMOUNT</span>
          </div>

          ${order.items.map(item => `
            <div class="item-row">
              <span class="item-name">${item.menuItemName}</span>
              <span class="item-qty">&times;${item.quantity}</span>
              <span class="item-amt">&#8377;${item.totalPrice.toFixed(2)}</span>
            </div>
          `).join('')}

          <hr class="sep" style="margin-top:12px" />

          <div class="totals">
            <div class="total-row">
              <span class="total-label">Subtotal</span>
              <span class="total-value">&#8377;${order.subtotal.toFixed(2)}</span>
            </div>
            <div class="total-row">
              <span class="total-label">GST / Tax${taxLabel ? ` (${taxLabel})` : ''}</span>
              <span class="total-value">&#8377;${order.taxAmount.toFixed(2)}</span>
            </div>
            ${order.discountAmount > 0 ? `
            <div class="total-row">
              <span class="total-label">Discount</span>
              <span class="total-value" style="color:#16a34a">- &#8377;${order.discountAmount.toFixed(2)}</span>
            </div>` : ''}
            ${payment && payment.tip > 0 ? `
            <div class="total-row">
              <span class="total-label">Tip</span>
              <span class="total-value" style="color:#16a34a">&#8377;${payment.tip.toFixed(2)}</span>
            </div>` : ''}
            <div class="grand-row">
              <span>TOTAL</span>
              <span class="grand-amount">&#8377;${(payment?.amount ?? order.totalAmount).toFixed(2)}</span>
            </div>
          </div>

          ${payment ? `
          <hr class="sep" />
          <div class="payment-info">
            <div class="payment-row">
              <span class="payment-label">Payment Method</span>
              <span class="total-value">${payment.method}</span>
            </div>
            <div class="payment-row">
              <span class="payment-label">Status</span>
              <span class="paid-badge">&#10003; ${payment.status}</span>
            </div>
            ${payment.change && payment.change > 0 ? `
            <div class="payment-row">
              <span class="payment-label">Change Returned</span>
              <span class="total-value">&#8377;${payment.change.toFixed(2)}</span>
            </div>` : ''}
            ${payment.reference ? `
            <div class="payment-row">
              <span class="payment-label">Reference</span>
              <span class="total-value" style="font-size:11px">${payment.reference}</span>
            </div>` : ''}
          </div>
          ` : ''}

          <div class="footer">
            <div class="footer-thanks">Thank you for dining with us!</div>
            <div class="footer-sub">Please visit again &hearts;</div>
            <div class="footer-powered">Powered by RestoPOS &bull; This is a computer-generated receipt</div>
          </div>

          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); };
            };
          <\/script>
        </body>
      </html>
    `);
    printWin.document.close();
  };

  const handleDownload = () => {
    // Create a text-based receipt for download
    const lines: string[] = [];
    const w = 40; // receipt width in characters
    const sep = '─'.repeat(w);
    const dsep = '═'.repeat(w);

    lines.push(center('RESTRO POS', w));
    lines.push(center('Restaurant & Bar', w));
    lines.push(center('123 Food Street, City', w));
    lines.push(center('Tel: +91 98765 43210', w));
    lines.push(dsep);
    lines.push(`Order #: ${order.orderNumber}`);
    lines.push(`Date: ${orderDate.toLocaleDateString('en-IN')}`);
    lines.push(`Time: ${orderDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`);
    lines.push(`Type: ${order.type.replace('_', ' ')}`);
    if (order.tableName) lines.push(`Table: ${order.tableName}`);
    if (order.customerName) lines.push(`Customer: ${order.customerName}`);
    lines.push(sep);
    lines.push(padRow('ITEM', 'QTY', 'TOTAL', w));
    lines.push(sep);

    for (const item of order.items) {
      lines.push(
        padRow(
          truncStr(item.menuItemName, 22),
          `x${item.quantity}`,
          `₹${item.totalPrice.toFixed(2)}`,
          w
        )
      );
    }

    lines.push(sep);
    lines.push(padRow('Subtotal', '', `₹${order.subtotal.toFixed(2)}`, w));
    lines.push(padRow(`Tax (${order.taxRate}%)`, '', `₹${order.taxAmount.toFixed(2)}`, w));
    if (payment && payment.tip > 0) {
      lines.push(padRow('Tip', '', `₹${payment.tip.toFixed(2)}`, w));
    }
    lines.push(dsep);
    lines.push(padRow('TOTAL', '', `₹${(payment?.amount ?? order.totalAmount).toFixed(2)}`, w));
    lines.push(dsep);
    if (payment) {
      lines.push(`Paid by: ${payment.method}`);
      if (payment.reference) lines.push(`Ref: ${payment.reference}`);
    }
    lines.push('');
    lines.push(center('Thank you for dining!', w));
    lines.push(center('Please visit again ❤️', w));

    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt_${order.orderNumber}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={true} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2 border-b border-border/50">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <ReceiptIcon className="w-4 h-4 text-primary" /> Tax Receipt #{order.orderNumber}
          </DialogTitle>
          <DialogDescription className="sr-only">Printable guest receipt</DialogDescription>
        </DialogHeader>

        {/* Paper Receipt Simulation */}
        <div className="p-5 overflow-y-auto max-h-[70vh]">
          <div
            id="receipt-print-area"
            className="p-6 rounded-lg bg-card border border-border/80 shadow-inner font-mono text-xs text-foreground space-y-4"
          >
            {/* Header */}
            <div className="text-center space-y-0.5">
              <h3 className="text-base font-black tracking-widest uppercase">RESTRO POS</h3>
              <p className="text-[11px] text-muted-foreground">Restaurant & Bar</p>
              <p className="text-[10px] text-muted-foreground">123 Food Street, City • +91 98765 43210</p>
            </div>

            <Separator className="border-dashed" />

            {/* Order meta */}
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>Order #{order.orderNumber}</span>
                <span>{orderDate.toLocaleDateString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span className="capitalize">{order.type.replace('_', ' ').toLowerCase()}</span>
                <span>{orderDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {order.tableName && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Table: {order.tableName}</span>
                  {order.userName && <span>Server: {order.userName}</span>}
                </div>
              )}
              {order.customerName && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Customer: {order.customerName}</span>
                </div>
              )}
            </div>

            <Separator className="border-dashed" />

            {/* Item list */}
            <div className="space-y-1.5">
              <div className="flex justify-between font-bold text-[11px] pb-1 border-b border-border/40">
                <span>ITEM</span>
                <span>QTY</span>
                <span className="text-right">AMT</span>
              </div>
              {order.items.map(item => (
                <div key={item.id} className="flex justify-between text-[11px]">
                  <span className="truncate flex-1 pr-2">{item.menuItemName}</span>
                  <span className="w-8 text-center text-muted-foreground">×{item.quantity}</span>
                  <span className="w-16 text-right font-medium">₹{item.totalPrice.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <Separator className="border-dashed" />

            {/* Totals */}
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>₹{order.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Tax ({order.taxRate}%)</span>
                <span>₹{order.taxAmount.toFixed(2)}</span>
              </div>
              {order.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Discount</span>
                  <span>-₹{order.discountAmount.toFixed(2)}</span>
                </div>
              )}
              {payment && payment.tip > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Tip</span>
                  <span>₹{payment.tip.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-sm pt-1.5 border-t border-border/40 text-foreground">
                <span>TOTAL</span>
                <span className="text-primary">₹{(payment?.amount ?? order.totalAmount).toFixed(2)}</span>
              </div>
            </div>

            {payment && (
              <div className="pt-2 border-t border-border/40 text-[11px] text-muted-foreground space-y-0.5">
                <div className="flex justify-between">
                  <span>Method: {payment.method}</span>
                  <span className="text-emerald-400 font-semibold">{payment.status}</span>
                </div>
                {payment.reference && (
                  <div className="flex justify-between text-[10px]">
                    <span>Ref:</span>
                    <span className="truncate max-w-[180px]">{payment.reference}</span>
                  </div>
                )}
              </div>
            )}

            <Separator className="border-dashed" />

            <div className="text-center text-[10px] text-muted-foreground space-y-0.5 pt-1">
              <p className="font-bold text-foreground">Thank you for dining with us!</p>
              <p>Please visit again ❤️</p>
              <p className="pt-1 text-[9px] text-muted-foreground/60">Powered by RestoPOS</p>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="p-4 pt-2 border-t border-border/50 flex gap-2">
          <Button
            variant="outline"
            className="flex-1 gap-2 text-xs"
            onClick={handleDownload}
          >
            <Download className="w-3.5 h-3.5" /> Download
          </Button>
          <Button
            className="flex-1 gap-2 text-xs font-semibold"
            onClick={handlePrint}
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Text receipt helpers ────────────────────────────────────────────────────
function center(text: string, width: number): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(pad) + text;
}

function padRow(left: string, mid: string, right: string, width: number): string {
  const midPart = mid ? ` ${mid} ` : ' ';
  const space = Math.max(1, width - left.length - midPart.length - right.length);
  return left + ' '.repeat(space) + midPart + right;
}

function truncStr(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}

