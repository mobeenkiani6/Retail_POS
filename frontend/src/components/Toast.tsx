import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

type ToastData = {
  id: number;
  message: string;
  type: ToastType;
};

let toastId = 0;
let addToastFn: ((message: string, type: ToastType) => void) | null = null;

/** Call this from anywhere to show a toast notification */
export function showToast(message: string, type: ToastType = 'info') {
  addToastFn?.(message, type);
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  useEffect(() => {
    addToastFn = (message: string, type: ToastType) => {
      const id = ++toastId;
      setToasts(prev => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 4000);
    };
    return () => { addToastFn = null; };
  }, []);

  const dismiss = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const styles: Record<ToastType, { icon: React.ReactNode; wrap: string; text: string }> = {
    success: {
      icon: <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />,
      wrap: 'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-800',
      text: 'text-emerald-950 dark:text-emerald-50',
    },
    error: {
      icon: <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />,
      wrap: 'bg-red-50 dark:bg-red-950/90 border-red-200 dark:border-red-800',
      text: 'text-red-950 dark:text-red-50',
    },
    info: {
      icon: <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />,
      wrap: 'bg-blue-50 dark:bg-blue-950/90 border-blue-200 dark:border-blue-800',
      text: 'text-blue-950 dark:text-blue-50',
    },
  };

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-3 pointer-events-none" style={{ maxWidth: 400 }}>
      {toasts.map(t => {
        const s = styles[t.type];
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg ${s.wrap} animate-slide-in`}
          >
            {s.icon}
            <p className={`text-sm font-medium flex-1 ${s.text}`}>{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors shrink-0">
              <X className={`w-4 h-4 ${s.text} opacity-70`} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
