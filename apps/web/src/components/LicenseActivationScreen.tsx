import React, { useState } from 'react';
import { ShieldCheck, KeyRound, Loader2, AlertCircle, CheckCircle2, Building2, Mail, Calendar, Monitor, Zap } from 'lucide-react';
import { saveLicenseKey, verifyLicenseKey, LicenseVerifyResult } from '@/lib/tauri';

interface Props {
  onActivated: (payload: LicenseVerifyResult) => void;
}

export function LicenseActivationScreen({ onActivated }: Props) {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<LicenseVerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');

  const handleVerify = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await verifyLicenseKey(key.trim());
      if (!result) {
        setError('Could not verify license. Please try again.');
        return;
      }
      if (!result.valid) {
        setError(result.reason ?? 'Invalid license key');
        return;
      }
      setPreview(result);
      setStep('confirm');
    } catch (e) {
      setError('An error occurred verifying the license.');
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await saveLicenseKey(key.trim());
      if (!result?.valid) {
        setError(result?.reason ?? 'Failed to activate license');
        return;
      }
      onActivated(result);
    } catch (e) {
      setError('Failed to save license. Check app permissions.');
    } finally {
      setLoading(false);
    }
  };

  const payload = preview?.payload;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/10 ring-2 ring-primary/20 mb-5">
            <ShieldCheck size={40} className="text-primary" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Restaurant POS</h1>
          <p className="text-muted-foreground mt-2 text-sm font-medium">
            {step === 'enter' ? 'Enter your license key to activate' : 'Review and confirm activation'}
          </p>
        </div>

        {step === 'enter' && (
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                License Key
              </label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <textarea
                  value={key}
                  onChange={e => { setKey(e.target.value); setError(null); }}
                  placeholder="RPOS.eyJ..."
                  rows={4}
                  className="w-full pl-9 pr-4 py-3 bg-muted/40 border border-border rounded-xl text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Paste the license key provided by your POS vendor
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-xl p-3.5">
                <AlertCircle size={16} className="text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive font-medium">{error}</p>
              </div>
            )}

            <button
              onClick={handleVerify}
              disabled={!key.trim() || loading}
              className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              {loading ? 'Verifying...' : 'Verify License'}
            </button>
          </div>
        )}

        {step === 'confirm' && payload && (
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
            {/* License details */}
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={18} className="text-emerald-400" />
                <span className="text-sm font-bold text-emerald-400">Valid License Detected</span>
              </div>
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center gap-2.5">
                  <Building2 size={14} className="text-muted-foreground shrink-0" />
                  <span className="font-semibold text-foreground">{payload.restaurantName}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Mail size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">{payload.email}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Calendar size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">
                    {payload.expiresAt
                      ? `Expires ${payload.expiresAt} (${preview?.daysRemaining ?? '?'} days remaining)`
                      : 'Lifetime license'}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Monitor size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Up to {payload.maxDevices} terminal{payload.maxDevices !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Zap size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex flex-wrap gap-1.5">
                    {payload.features.map(f => (
                      <span key={f} className="text-xs bg-primary/15 text-primary px-2 py-0.5 rounded-md font-semibold capitalize">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              License ID: <span className="font-mono font-semibold">{payload.licenseId}</span>
            </p>

            {error && (
              <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-xl p-3.5">
                <AlertCircle size={16} className="text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive font-medium">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setStep('enter'); setPreview(null); setError(null); }}
                className="flex-1 h-12 bg-muted text-muted-foreground rounded-xl font-bold text-sm hover:bg-muted/80 transition-all"
              >
                Back
              </button>
              <button
                onClick={handleActivate}
                disabled={loading}
                className="flex-2 flex-grow h-12 bg-primary text-primary-foreground rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                {loading ? 'Activating...' : 'Activate License'}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-6">
          Need a license? Contact your POS vendor.
        </p>
      </div>
    </div>
  );
}

