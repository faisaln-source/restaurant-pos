import { useState } from 'react';
import {
  CheckCircle, ArrowRight, Loader2, Receipt, MessageCircle,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import toast from 'react-hot-toast';
import {
  processPayment,
  settleSeats,
} from '../services/payment.service';
import type { Order } from '../lib/types';
import { shareOrderOnWhatsApp } from '../lib/kitchenTicket';

type PaymentMethod = 'UPI';

interface Props {
  order: Order;
  onClose: () => void;
  onSuccess: (paymentId: string) => void;
  /** When set, only this amount is billed (partial seat settlement) */
  overrideAmount?: number;
  /** Human label shown in the header, e.g. "Seat 1 & 2" */
  seatLabel?: string;
  /** Seat numbers being settled — used for partial payment API */
  seatNumbers?: number[];
}

const TIP_PRESETS = [0, 5, 10, 15, 20];

export default function PaymentModal({ order, onClose, onSuccess, overrideAmount, seatLabel, seatNumbers }: Props) {
  const [tipPercent, setTipPercent] = useState(0);
  const [customTip, setCustomTip] = useState('');
  const [reference, setReference] = useState('');
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [allPaid, setAllPaid] = useState(true);
  const [paymentId, setPaymentId] = useState('');
  const [showShare, setShowShare] = useState(false);
  const [sharePhone, setSharePhone] = useState('');

  const tipAmount = customTip
    ? parseFloat(customTip) || 0
    : (overrideAmount ?? order.totalAmount) * (tipPercent / 100);
  const grandTotal = (overrideAmount ?? order.totalAmount) + tipAmount;

  // ── Manual UPI Confirm ─────────────────────────────────────────────────────
  const handleConfirmPayment = async () => {
    setProcessing(true);
    try {
      const utrRef = reference.trim() || `upi_${Date.now()}`;
      if (seatNumbers && seatNumbers.length > 0) {
        const res = await settleSeats(
          order.id,
          seatNumbers,
          'UPI',
          grandTotal,
          tipAmount,
          utrRef
        );
        setPaymentId(res.payment.id);
        setAllPaid(res.allPaid);
        setSuccess(true);
        toast.success(res.allPaid ? 'All seats paid! Table is now free.' : `${seatLabel || 'Seats'} paid successfully!`);
      } else {
        const id = await processPayment(
          order,
          'UPI',
          grandTotal,
          tipAmount,
          utrRef
        );
        setPaymentId(id);
        setAllPaid(true);
        setSuccess(true);
        toast.success('UPI Payment confirmed & settled!');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Payment confirmation failed');
    } finally {
      setProcessing(false);
    }
  };

  const copyUpiId = () => {};

  return (
    <Dialog open={true} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-[#11131a] border border-white/10 text-white shadow-2xl">
        {success ? (
          <div className="p-6 text-center space-y-4">
            <DialogHeader className="sr-only">
              <DialogTitle>Payment Successful</DialogTitle>
              <DialogDescription>Order #{order.orderNumber} settled successfully</DialogDescription>
            </DialogHeader>
            <div className="h-16 w-16 mx-auto rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center animate-in zoom-in-75">
              <CheckCircle className="h-9 w-9 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tight text-white">Payment Completed!</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Order #{order.orderNumber} settled via UPI</p>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 text-left space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Total Settled:</span>
                <span className="font-mono font-bold text-white text-base">₹{grandTotal.toFixed(2)}</span>
              </div>
              {tipAmount > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Gratuity Included:</span>
                  <span className="text-emerald-400 font-medium font-mono">₹{tipAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 pt-1 border-t border-white/10">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>{allPaid ? 'Table status updated to Available • Bill cleared' : `${seatLabel || 'Selected seats'} settled • Remaining seats active`}</span>
              </div>
            </div>

            {/* ── WhatsApp phone input ── */}
            {showShare && (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  type="tel"
                  placeholder="Customer WhatsApp number (e.g. 9876543210)"
                  value={sharePhone}
                  onChange={e => setSharePhone(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && sharePhone.trim()) {
                      shareOrderOnWhatsApp(order, sharePhone.trim());
                      setShowShare(false); setSharePhone('');
                    }
                    if (e.key === 'Escape') { setShowShare(false); setSharePhone(''); }
                  }}
                  className="flex-1 h-9 text-sm bg-white/5 border-white/15 text-white placeholder:text-zinc-500"
                />
                <Button
                  size="sm"
                  className="h-9 px-3 bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold"
                  onClick={() => {
                    if (sharePhone.trim()) {
                      shareOrderOnWhatsApp(order, sharePhone.trim());
                      setShowShare(false); setSharePhone('');
                    }
                  }}
                >
                  <MessageCircle className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 px-2 text-zinc-400 hover:text-white"
                  onClick={() => { setShowShare(false); setSharePhone(''); }}
                >
                  ✕
                </Button>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1 gap-2 border-[#25D366]/40 bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] font-bold cursor-pointer"
                onClick={() => setShowShare(v => !v)}
              >
                <MessageCircle className="w-4 h-4" /> Share Bill
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-2 border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold cursor-pointer"
                onClick={() => { onSuccess(paymentId); onClose(); }}
              >
                <Receipt className="w-4 h-4" /> View Receipt
              </Button>
              <Button
                className="flex-1 bg-primary text-primary-foreground font-black hover:bg-primary/90 cursor-pointer"
                onClick={() => { onSuccess(paymentId); onClose(); }}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <DialogHeader className="p-6 pb-2 border-b border-white/10 bg-white/[0.02]">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-lg font-black text-white">{seatLabel ? `Settle ${seatLabel}` : 'Settle Bill — UPI Payment'}</DialogTitle>
                  <DialogDescription className="text-xs text-zinc-400">
                    Order #{order.orderNumber} {order.tableName ? `• Table ${order.tableName}` : ''} {seatLabel ? `• ${seatLabel}` : ''}
                  </DialogDescription>
                </div>
                <Badge variant="outline" className="font-mono text-sm px-2.5 py-0.5 border-primary/40 bg-primary/10 text-primary font-black">
                  ₹{grandTotal.toFixed(2)}
                </Badge>
              </div>
            </DialogHeader>

            <div className="px-6 space-y-4 max-h-[70vh] overflow-y-auto pb-2">
              {/* Bill Financial Summary */}
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-1.5 text-xs">
                <div className="flex justify-between text-zinc-400">
                  <span>Subtotal ({order.items.length} items)</span>
                  <span className="font-mono text-zinc-300">₹{order.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Tax ({order.taxRate}%)</span>
                  <span className="font-mono text-zinc-300">₹{order.taxAmount.toFixed(2)}</span>
                </div>
                {order.extraCharges > 0 && (
                  <div className="flex justify-between text-amber-400 font-medium">
                    <span>Extra Charges</span>
                    <span className="font-mono">₹{order.extraCharges.toFixed(2)}</span>
                  </div>
                )}
                {tipAmount > 0 && (
                  <div className="flex justify-between text-emerald-400 font-medium">
                    <span>Gratuity Tip</span>
                    <span className="font-mono">+₹{tipAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-sm text-white pt-1.5 border-t border-white/10">
                  <span>Grand Total Due</span>
                  <span className="text-primary font-mono text-base">₹{grandTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* UTR / Reference */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    UTR / Transaction ID <span className="text-zinc-500 normal-case font-normal">(Optional)</span>
                  </label>
                  <span className="text-[10px] text-zinc-500">12-digit ref</span>
                </div>
                <Input
                  placeholder="e.g. 428172918231 or leave blank"
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  className="text-sm bg-white/5 border-white/10 text-white font-mono h-10"
                  autoFocus
                />
              </div>

              {/* Gratuity Tip */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Gratuity Tip</label>
                  {tipAmount > 0 && (
                    <span className="text-xs font-bold text-emerald-400 font-mono">
                      +₹{tipAmount.toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="flex gap-1.5">
                  {TIP_PRESETS.map(p => (
                    <Button
                      key={p}
                      type="button"
                      size="sm"
                      variant={tipPercent === p && !customTip ? 'default' : 'outline'}
                      className={`flex-1 h-8 text-xs px-1 ${tipPercent === p && !customTip ? 'bg-primary text-primary-foreground font-black' : 'border-white/10 text-zinc-300'}`}
                      onClick={() => { setTipPercent(p); setCustomTip(''); }}
                    >
                      {p === 0 ? 'None' : `${p}%`}
                    </Button>
                  ))}
                </div>
                <Input
                  type="number"
                  placeholder="Or enter custom tip (₹)"
                  value={customTip}
                  onChange={e => { setCustomTip(e.target.value); setTipPercent(0); }}
                  min="0"
                  step="1"
                  className="h-8 text-xs bg-white/5 border-white/10 text-white font-mono"
                />
              </div>
            </div>

            {/* Footer Action Button */}
            <div className="p-6 pt-3 border-t border-white/10 bg-white/[0.02]">
              <Button
                className="w-full h-11 text-sm font-black gap-2 bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/50 cursor-pointer"
                onClick={handleConfirmPayment}
                disabled={processing}
              >
                {processing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Confirming Payment...</>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Confirm UPI Payment • ₹{grandTotal.toFixed(2)}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
