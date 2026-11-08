import React, { useEffect, useState } from 'react';
import { Power, AlertTriangle, ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { exitApp, isTauri, listenTauri } from '@/lib/tauri';

export function ExitConfirmModal() {
  const [open, setOpen] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // 1. Listen for custom DOM event dispatched from in-app exit buttons
    const handleCustomExit = () => setOpen(true);
    window.addEventListener('app:request-exit', handleCustomExit);

    // 2. Listen for Tauri window close request (user clicked window 'X' or Alt+F4)
    let unlistenTauri: (() => void) | undefined;
    if (isTauri()) {
      listenTauri<void>('request-app-exit', () => {
        setOpen(true);
      }).then(cleanup => {
        unlistenTauri = cleanup;
      }).catch(err => {
        console.warn('Failed to register request-app-exit listener:', err);
      });
    }

    // 3. Web browser safety: prompt on accidental tab close / reload
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Are you sure you want to exit the POS?';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('app:request-exit', handleCustomExit);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (unlistenTauri) unlistenTauri();
    };
  }, []);

  const handleConfirmExit = async () => {
    setIsExiting(true);
    try {
      await exitApp();
    } catch (err) {
      console.error('Error during exit:', err);
      setIsExiting(false);
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={val => { if (!isExiting) setOpen(val); }}>
      <DialogContent className="sm:max-w-md border-border/80 bg-card p-6 shadow-2xl">
        <DialogHeader className="text-center sm:text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/15 border border-rose-500/20 text-rose-500 shadow-inner">
            <Power className="h-7 w-7" />
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
            Exit Restaurant POS?
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
            Are you sure you want to close the application? All kitchen tickets, completed sales, and table sessions remain safely saved.
          </DialogDescription>
        </DialogHeader>

        <div className="my-2 rounded-xl bg-muted/40 border border-border/60 p-3 text-xs text-muted-foreground flex items-center gap-2.5">
          <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
          <span>Local database and active orders are safely preserved on exit.</span>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto h-10 font-medium"
            disabled={isExiting}
            onClick={() => setOpen(false)}
          >
            Cancel / Stay in POS
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="w-full sm:w-auto h-10 font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-950/20 flex items-center justify-center gap-2"
            disabled={isExiting}
            onClick={handleConfirmExit}
          >
            {isExiting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Closing POS…</span>
              </>
            ) : (
              <>
                <Power className="w-4 h-4" />
                <span>Exit Application</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
export default ExitConfirmModal;

