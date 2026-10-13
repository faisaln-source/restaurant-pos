import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  QrCode, Banknote, CreditCard, ShieldCheck,
  CheckCircle, Loader2, Receipt, ArrowRight,
  Smartphone, Copy, Check, RefreshCw, AlertCircle,
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
  createRazorpayOrder,
  verifyRazorpayPayment,
  getRazorpayConfig,
  generateDynamicQR,
  checkQRPaymentStatus,
  type DynamicQRResponse,
} from '../services/payment.service';
import { useSocketEvent } from '../lib/socket';
import type { Order } from '../lib/types';

type PaymentMethod = 'UPI_QR' | 'RAZORPAY' | 'CASH' | 'CARD';

interface Props {
  order: Order;
  onClose: () => void;
  onSuccess: (paymentId: string) => void;
}

const METHODS: { key: PaymentMethod; label: string; desc: string; icon: any }[] = [
  { key: 'UPI_QR',   label: 'Scan & Pay QR',   desc: 'Dynamic UPI QR (GPay/PhonePe)', icon: QrCode },
  { key: 'RAZORPAY', label: 'Razorpay Online', desc: 'Cards, NetBanking, Wallets',    icon: ShieldCheck },
  { key: 'CASH',     label: 'Cash Counter',    desc: 'Physical currency tender',      icon: Banknote },
  { key: 'CARD',     label: 'Card POS Swipe',  desc: 'External swipe terminal',       icon: CreditCard },
];

const TIP_PRESETS = [0, 5, 10, 15, 20];

export default function PaymentModal({ order, onClose, onSuccess }: Props) {
  const [method, setMethod] = useState<PaymentMethod>('UPI_QR');
  const [tipPercent, setTipPercent] = useState(0);
  const [customTip, setCustomTip] = useState('');
  const [cashReceived, setCashReceived] = useState('');
  const [reference, setReference] = useState('');
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [paymentId, setPaymentId] = useState('');

  // ── Dynamic QR State ───────────────────────────────────────────────────────
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrMeta, setQrMeta] = useState<DynamicQRResponse | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const pollingRef = useRef<any>(null);

  const tipAmount = customTip
    ? parseFloat(customTip) || 0
    : order.totalAmount * (tipPercent / 100);
  const grandTotal = order.totalAmount + tipAmount;
  const cashValue = parseFloat(cashReceived) || 0;
  const changeAmount = Math.max(0, cashValue - grandTotal);

  // ── Generate QR Code on Mount / Method / Amount change ─────────────────────
  const loadDynamicQR = async () => {
    setLoadingQr(true);
    try {
      const qrRes = await generateDynamicQR(order.id, grandTotal);
      setQrMeta(qrRes);

      // Generate visual QR image from standard UPI scheme or Razorpay URL
      const payloadToRender = qrRes.upiPayload;
      const dataUrl = await QRCode.toDataURL(payloadToRender, {
        margin: 1,
        width: 320,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      });
      setQrDataUrl(dataUrl);
    } catch (err) {
      console.error('Failed to generate dynamic QR:', err);
      toast.error('Could not generate dynamic QR code');
    } finally {
      setLoadingQr(false);
    }
  };

  // Reset processing + clear stale QR when switching payment methods
  const handleMethodChange = (newMethod: PaymentMethod) => {
    if (newMethod === method) return;
    setProcessing(false);
    if (newMethod !== 'UPI_QR') {
      // Stop polling when leaving QR view
      if (pollingRef.current) clearInterval(pollingRef.current);
    }
    setMethod(newMethod);
  };

  useEffect(() => {
    if (method === 'UPI_QR' && !success) {
      loadDynamicQR();
    }
  }, [method, grandTotal]);

  // ── Real-Time Polling for QR Payment Completion ────────────────────────────
  useEffect(() => {
    if (method !== 'UPI_QR' || success) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    pollingRef.current = setInterval(async () => {
      try {
        const res = await checkQRPaymentStatus(order.id, qrMeta?.razorpayQrId || undefined);
        if (res.paid && res.payment) {
          clearInterval(pollingRef.current);
          setPaymentId(res.payment.id);
          setSuccess(true);
          toast.success('Payment received & verified!');
        }
      } catch {
        /* silence polling errors */
      }
    }, 3000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [method, success, qrMeta, order.id]);

  // ── Listen for real-time WebSocket payment events ──────────────────────────
  useSocketEvent('payment:completed', (p: any) => {
    if (p && (p.orderId === order.id || p.order_id === order.id)) {
      setPaymentId(p.id);
      setSuccess(true);
      toast.success('Payment confirmed in real-time!');
    }
  });

  // ── Manual Confirm / Settle for QR Payment ────────────────────────────────
  const handleConfirmQRPayment = async () => {
    setProcessing(true);
    try {
      const utrRef = reference.trim() || `upi_${Date.now()}`;
      const id = await processPayment(
        order,
        'UPI',
        grandTotal,
        tipAmount,
        utrRef
      );
      setPaymentId(id);
      setSuccess(true);
      toast.success('UPI Payment confirmed & settled!');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Payment confirmation failed');
    } finally {
      setProcessing(false);
    }
  };

  // ── Cash / Card Settlement ────────────────────────────────────────────────
  const handleStandardPay = async (payMethod: 'CASH' | 'CARD') => {
    if (payMethod === 'CASH' && cashValue < grandTotal) {
      toast.error('Cash received is less than the total');
      return;
    }

    setProcessing(true);
    try {
      const id = await processPayment(
        order,
        payMethod,
        grandTotal,
        tipAmount,
        reference || undefined
      );
      setPaymentId(id);
      setSuccess(true);
      toast.success('Payment successfully processed!');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Payment processing failed');
    } finally {
      setProcessing(false);
    }
  };

  // ── Razorpay Online Popup Gateway Flow ────────────────────────────────────
  const handleRazorpayPay = async () => {
    setProcessing(true);
    try {
      const orderData = await createRazorpayOrder(order.id, grandTotal);
      const hasRazorpayWindow = typeof (window as any).Razorpay !== 'undefined';

      if (!hasRazorpayWindow) {
        toast.error('Razorpay SDK is loading, please try in a moment');
        setProcessing(false);
        return;
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'QuickServe Restaurant',
        description: `Order #${order.orderNumber} Bill Settlement`,
        order_id: orderData.razorpayOrderId.startsWith('order_') && orderData.razorpayOrderId.length > 20
          ? orderData.razorpayOrderId
          : undefined,
        handler: async (response: any) => {
          try {
            setProcessing(true);
            const p = await verifyRazorpayPayment({
              orderId: order.id,
              razorpayOrderId: response.razorpay_order_id || orderData.razorpayOrderId,
              razorpayPaymentId: response.razorpay_payment_id || `pay_${Date.now()}`,
              razorpaySignature: response.razorpay_signature || '',
              method: 'CARD',
            });
            setPaymentId(p.id);
            setSuccess(true);
            toast.success('Razorpay payment verified & captured!');
          } catch (vErr) {
            toast.error('Payment signature verification failed');
          } finally {
            setProcessing(false);
          }
        },
        prefill: {
          name: order.customerName || 'Restaurant Guest',
          contact: (order as any).customerPhone || '',
        },
        theme: {
          color: '#3b82f6',
        },
        modal: {
          ondismiss: () => {
            setProcessing(false);
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (response: any) => {
        setProcessing(false);
        toast.error(`Payment failed: ${response.error?.description || 'Declined'}`);
      });
      rzp.open();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Unable to initialize Razorpay');
      setProcessing(false);
    }
  };

  const copyUpiId = () => {
    if (qrMeta?.upiId) {
      navigator.clipboard.writeText(qrMeta.upiId);
      setCopiedUpi(true);
      toast.success('UPI ID copied to clipboard');
      setTimeout(() => setCopiedUpi(false), 2000);
    }
  };

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
              <p className="text-xs text-zinc-400 mt-0.5">Order #{order.orderNumber} settled via {method.replace('_', ' ')}</p>
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
              {method === 'CASH' && changeAmount > 0 && (
                <div className="flex justify-between text-xs pt-1 border-t border-white/10 font-semibold">
                  <span className="text-amber-400">Change Returned:</span>
                  <span className="text-amber-400 font-mono">₹{changeAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 pt-1 border-t border-white/10">
                <Check className="w-3.5 h-3.5" />
                <span>Table status updated to Available • Bill cleared</span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1 gap-2 border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold cursor-pointer"
                onClick={() => {
                  onSuccess(paymentId);
                  onClose();
                }}
              >
                <Receipt className="w-4 h-4" /> View Receipt
              </Button>
              <Button
                className="flex-1 bg-primary text-primary-foreground font-black hover:bg-primary/90 cursor-pointer"
                onClick={() => {
                  onSuccess(paymentId);
                  onClose();
                }}
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
                  <DialogTitle className="text-lg font-black text-white">Settle Bill &amp; Payment</DialogTitle>
                  <DialogDescription className="text-xs text-zinc-400">
                    Order #{order.orderNumber} {order.tableName ? `• Table ${order.tableName}` : ''}
                  </DialogDescription>
                </div>
                <Badge variant="outline" className="font-mono text-sm px-2.5 py-0.5 border-primary/40 bg-primary/10 text-primary font-black">
                  ₹{grandTotal.toFixed(2)}
                </Badge>
              </div>
            </DialogHeader>

            <div className="px-6 space-y-4 max-h-[70vh] overflow-y-auto">
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

              {/* Payment Methods Tabs */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Payment Method</label>
                <div className="grid grid-cols-2 gap-2">
                  {METHODS.map(m => {
                    const Icon = m.icon;
                    const isActive = method === m.key;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => handleMethodChange(m.key)}
                        className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                          isActive
                            ? 'border-primary bg-primary/10 text-white font-bold ring-1 ring-primary/40'
                            : 'border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.05] text-zinc-400'
                        }`}
                      >
                        <div className={`p-2 rounded-lg shrink-0 ${isActive ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-zinc-400'}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className={`text-xs font-bold ${isActive ? 'text-white' : 'text-zinc-200'}`}>{m.label}</div>
                          <div className="text-[10px] text-zinc-400 truncate">{m.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Dynamic UPI QR Code Display ────────────────────────── */}
              {method === 'UPI_QR' && (
                <div className="p-4 rounded-2xl border border-primary/30 bg-primary/[0.03] space-y-3.5 text-center">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white flex items-center gap-1.5">
                      <QrCode className="w-4 h-4 text-primary" /> Dynamic UPI QR Code
                    </span>
                    <button
                      type="button"
                      onClick={loadDynamicQR}
                      className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                      title="Regenerate QR"
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingQr ? 'animate-spin' : ''}`} /> Refresh
                    </button>
                  </div>

                  {/* QR Image Container */}
                  <div className="relative mx-auto w-64 h-64 bg-white p-3 rounded-2xl shadow-xl flex items-center justify-center border-4 border-white/20">
                    {loadingQr ? (
                      <div className="flex flex-col items-center justify-center gap-2 text-slate-800">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        <span className="text-xs font-bold">Generating QR...</span>
                      </div>
                    ) : qrDataUrl ? (
                      <div className="relative w-full h-full flex items-center justify-center">
                        <img
                          src={qrDataUrl}
                          alt="Dynamic UPI QR Code"
                          className="w-full h-full object-contain rounded-lg"
                        />
                        {/* Center UPI Badge */}
                        <div className="absolute inset-0 m-auto w-10 h-10 bg-slate-900 border-2 border-white rounded-xl flex items-center justify-center shadow-lg pointer-events-none">
                          <span className="text-[10px] font-black text-amber-400 tracking-tighter">UPI</span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-rose-500 font-bold">Unable to load QR</span>
                    )}
                  </div>

                  {/* Real-time Listening Status Indicator */}
                  <div className="flex items-center justify-center gap-2 py-1 px-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400 font-bold w-fit mx-auto">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>Listening for incoming scan payment...</span>
                  </div>

                  {/* Payment Details */}
                  <div className="space-y-1 text-xs">
                    <div className="text-zinc-300 font-semibold">
                      Exact Amount: <span className="font-mono font-black text-primary text-sm">₹{grandTotal.toFixed(2)}</span>
                    </div>
                    {qrMeta && (
                      <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-400 font-mono">
                        <span>VPA: {qrMeta.upiId}</span>
                        <button
                          type="button"
                          onClick={copyUpiId}
                          className="p-1 hover:text-white cursor-pointer"
                          title="Copy UPI ID"
                        >
                          {copiedUpi ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Accepted UPI Apps Banner */}
                  <div className="pt-2 border-t border-white/10 flex items-center justify-center gap-2 text-[10px] text-zinc-400">
                    <span>Google Pay</span>
                    <span>•</span>
                    <span>PhonePe</span>
                    <span>•</span>
                    <span>Paytm</span>
                    <span>•</span>
                    <span>BHIM</span>
                    <span>•</span>
                    <span>CRED</span>
                  </div>

                  {/* Cashier Verification Input for UTR / Reference */}
                  <div className="pt-2 space-y-2 text-left">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                        UTR / Transaction ID (Optional)
                      </label>
                      <span className="text-[10px] text-zinc-400">12-digit ref</span>
                    </div>
                    <Input
                      placeholder="e.g. 428172918231 or leave blank"
                      value={reference}
                      onChange={e => setReference(e.target.value)}
                      className="text-xs bg-white/5 border-white/10 text-white font-mono h-8"
                    />
                  </div>
                </div>
              )}

              {/* ── Razorpay Gateway Panel ─────────────────────────────── */}
              {method === 'RAZORPAY' && (
                <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-950/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md bg-blue-500/20 flex items-center justify-center text-blue-400">
                        <ShieldCheck className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-black text-blue-300">Razorpay Gateway Checkout</span>
                    </div>
                    <Badge variant="outline" className="border-blue-500/30 text-blue-400 bg-blue-500/10 text-[10px]">
                      Cards &amp; NetBanking
                    </Badge>
                  </div>

                  <p className="text-xs text-zinc-300 leading-relaxed">
                    Customer can pay via <strong>Credit / Debit Card</strong> (Visa, Mastercard, RuPay), <strong>Net Banking</strong> (50+ banks), or <strong>Razorpay UPI</strong>.
                  </p>

                  <div className="flex flex-wrap gap-1.5 text-[10px]">
                    <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-zinc-300 font-mono">Credit/Debit Cards</span>
                    <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-zinc-300 font-mono">Net Banking</span>
                    <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-zinc-300 font-mono">UPI Intent</span>
                  </div>
                </div>
              )}

              {/* ── Tips Gratuity Section ──────────────────────────────── */}
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

              {/* ── Cash Received Tender ───────────────────────────────── */}
              {method === 'CASH' && (
                <div className="space-y-2 p-3 rounded-xl border border-white/10 bg-white/[0.02]">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Cash Received</label>
                    <span className="text-[11px] text-zinc-400 font-mono">Min ₹{grandTotal.toFixed(2)}</span>
                  </div>
                  <Input
                    type="number"
                    placeholder={`e.g. ${Math.ceil(grandTotal)}`}
                    value={cashReceived}
                    onChange={e => setCashReceived(e.target.value)}
                    min="0"
                    step="1"
                    autoFocus
                    className="font-mono text-base font-bold bg-white/5 border-white/10 text-white"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      Math.ceil(grandTotal),
                      Math.ceil(grandTotal / 100) * 100,
                      Math.ceil(grandTotal / 500) * 500,
                      500, 1000, 2000,
                    ]
                      .filter((v, i, a) => v >= grandTotal && a.indexOf(v) === i)
                      .slice(0, 4)
                      .map(v => (
                        <Button
                          key={v}
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs font-mono px-2 bg-white/10 hover:bg-white/20 text-white"
                          onClick={() => setCashReceived(String(v))}
                        >
                          ₹{v}
                        </Button>
                      ))}
                  </div>

                  {cashValue >= grandTotal && changeAmount > 0 && (
                    <div className="flex items-center justify-between p-2 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-400 mt-2">
                      <span>Change to Return:</span>
                      <span className="text-sm font-bold font-mono">₹{changeAmount.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Card Reference ────────────────────────────────────── */}
              {method === 'CARD' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Card Terminal Authorization / Last 4 Digits
                  </label>
                  <Input
                    placeholder="Auth Code / Ref #"
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    className="text-xs bg-white/5 border-white/10 text-white font-mono"
                  />
                </div>
              )}
            </div>

            {/* ── Modal Footer Action Buttons ────────────────────────── */}
            <div className="p-6 pt-3 border-t border-white/10 bg-white/[0.02]">
              {method === 'UPI_QR' ? (
                <Button
                  className="w-full h-11 text-sm font-black gap-2 bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/50 cursor-pointer"
                  onClick={handleConfirmQRPayment}
                  disabled={processing}
                >
                  {processing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Verifying &amp; Freeing Table...</>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Confirm Payment Received • ₹{grandTotal.toFixed(2)}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              ) : method === 'RAZORPAY' ? (
                <Button
                  className="w-full h-11 text-sm font-black gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-950/50 cursor-pointer"
                  onClick={handleRazorpayPay}
                  disabled={processing}
                >
                  {processing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Launching Razorpay...</>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      Open Razorpay Checkout (₹{grandTotal.toFixed(2)})
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  className="w-full h-11 text-sm font-black gap-2 bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
                  onClick={() => handleStandardPay(method)}
                  disabled={processing || (method === 'CASH' && cashValue < grandTotal && cashValue > 0)}
                >
                  {processing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Processing Payment...</>
                  ) : (
                    <>
                      Confirm ₹{grandTotal.toFixed(2)} {method} Settlement
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
