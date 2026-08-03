import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export type ConfirmOptions = {
  title: string;
  message: string;
  /** Optional list of related effects to show (e.g. "3 inventory rows will be deleted") */
  relatedEffects?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
};

let showConfirmFn: ((opts: ConfirmOptions) => Promise<boolean>) | null = null;

/** Call this from anywhere to show a confirmation dialog. Returns a promise that resolves to true/false. */
export function showConfirm(opts: ConfirmOptions): Promise<boolean> {
  if (!showConfirmFn) return Promise.resolve(false);
  return showConfirmFn(opts);
}

export default function ConfirmDialogProvider() {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [resolver, setResolver] = useState<((val: boolean) => void) | null>(null);

  useEffect(() => {
    showConfirmFn = (options: ConfirmOptions) => {
      return new Promise<boolean>((resolve) => {
        setOpts(options);
        setResolver(() => resolve);
        setOpen(true);
      });
    };
    return () => { showConfirmFn = null; };
  }, []);

  const handleConfirm = () => {
    resolver?.(true);
    setOpen(false);
  };

  const handleCancel = () => {
    resolver?.(false);
    setOpen(false);
  };

  if (!open || !opts) return null;

  const isDanger = opts.variant === 'danger';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={handleCancel}>
      <div
        className="bg-surface rounded-2xl shadow-premium border border-border w-full max-w-md mx-4 overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-2.5 rounded-xl shrink-0 ${isDanger ? 'bg-danger-soft' : 'bg-warning-soft'}`}>
              <AlertTriangle className={`w-5 h-5 ${isDanger ? 'text-danger' : 'text-warning'}`} />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-foreground">{opts.title}</h3>
              <p className="text-sm text-muted mt-1 leading-relaxed">{opts.message}</p>
              {opts.relatedEffects && opts.relatedEffects.length > 0 && (
                <ul className="mt-2 text-sm text-muted list-disc list-inside space-y-0.5">
                  {opts.relatedEffects.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-canvas-subtle border-t border-border flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-foreground-secondary bg-surface border border-border rounded-xl hover:bg-canvas-subtle transition-colors"
          >
            {opts.cancelLabel || 'Cancel'}
          </button>
          <button
            onClick={handleConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-xl transition-colors ${
              isDanger ? 'bg-danger hover:bg-red-600' : 'bg-accent-600 hover:bg-accent-700'
            }`}
          >
            {opts.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
