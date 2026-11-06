/**
 * StartupScreen — shown while the embedded PostgreSQL and API server are
 * initialising on first launch (or after update).
 *
 * Receives progress events from the Tauri Rust backend and shows a friendly
 * spinner + status message.  Disappears automatically when "setup:done" fires.
 */

import { useEffect, useState } from 'react';
import { UtensilsCrossed, Database, Server, CheckCircle, XCircle } from 'lucide-react';
import { onSetupProgress, type SetupProgress } from '@/lib/tauri';

interface Props {
  onReady: () => void;
}

const PHASE_ICONS: Record<string, React.ReactNode> = {
  pg_init:  <Database  size={18} className="text-blue-400"   />,
  pg_start: <Database  size={18} className="text-blue-400"   />,
  pg_db:    <Database  size={18} className="text-blue-400"   />,
  migrate:  <Database  size={18} className="text-purple-400" />,
  api:      <Server    size={18} className="text-green-400"  />,
};

const PHASE_LABELS: Record<string, string> = {
  pg_init:  'Initialising database',
  pg_start: 'Starting database',
  pg_db:    'Preparing database',
  migrate:  'Applying migrations',
  api:      'Starting API server',
};

export default function StartupScreen({ onReady }: Props) {
  const [steps, setSteps] = useState<SetupProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentPhase, setCurrentPhase] = useState('pg_init');

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    onSetupProgress(
      (p) => {
        setCurrentPhase(p.phase);
        setSteps((prev) => {
          // Avoid duplicate entries for the same phase
          const exists = prev.some((s) => s.phase === p.phase);
          return exists ? prev : [...prev, p];
        });
      },
      () => {
        // setup:done — wait a tick then proceed
        setTimeout(onReady, 300);
      },
      (msg) => {
        setError(msg);
      },
    ).then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, [onReady]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center shadow-lg shadow-primary/20">
          <UtensilsCrossed size={32} className="text-primary" />
        </div>
        <h1 className="text-2xl font-black tracking-tight text-foreground">Restaurant POS</h1>
        <p className="text-sm text-muted-foreground">Setting up your system…</p>
      </div>

      {/* Steps */}
      <div className="w-full max-w-xs space-y-2.5 mb-8">
        {Object.keys(PHASE_LABELS).map((phase) => {
          const done = steps.some((s) => s.phase === phase);
          const active = currentPhase === phase && !done && !error;
          const pending = !done && !active;

          return (
            <div
              key={phase}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
                done    ? 'bg-green-500/10 text-green-400' :
                active  ? 'bg-primary/10 text-foreground' :
                pending ? 'opacity-30 text-muted-foreground' :
                ''
              }`}
            >
              <span className="shrink-0">
                {done
                  ? <CheckCircle size={18} className="text-green-400" />
                  : active
                  ? <Spinner />
                  : PHASE_ICONS[phase] ?? <Database size={18} />}
              </span>
              <span className="text-sm font-medium">
                {steps.find((s) => s.phase === phase)?.message ?? PHASE_LABELS[phase]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="w-full max-w-xs rounded-xl bg-destructive/10 border border-destructive/30 p-4 flex gap-3">
          <XCircle size={18} className="text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-destructive mb-1">Setup failed</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{error}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Check the logs in AppData\Restaurant POS\ and restart the app.
            </p>
          </div>
        </div>
      )}

      {/* Tagline */}
      {!error && (
        <p className="text-xs text-muted-foreground/50 mt-4">
          First launch takes ~15 seconds
        </p>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin text-primary"
      width={18} height={18}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

