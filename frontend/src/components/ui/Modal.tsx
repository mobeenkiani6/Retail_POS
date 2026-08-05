import { type ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  footer?: ReactNode;
};

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-6xl',
};

const sizeClass = (size: ModalProps['size']) => sizes[size ?? 'md'] ?? sizes.md;

export default function Modal({ open, onClose, title, description, children, size = 'md', footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className={`relative w-full ${sizeClass(size)} max-h-[min(90vh,880px)] flex flex-col bg-surface rounded-2xl shadow-premium border border-border overflow-hidden`}
            onClick={e => e.stopPropagation()}
          >
            {(title || description) && (
              <div className="px-6 pt-6 pb-4 border-b border-border-subtle shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    {title && <h2 className="text-lg font-semibold text-foreground">{title}</h2>}
                    {description && <p className="text-sm text-muted mt-1">{description}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-muted transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            <div className="px-6 py-5 overflow-y-auto overscroll-contain scroll-smooth scrollbar-thin min-h-0 flex-1">
              {children}
            </div>
            {footer && (
              <div className="px-6 py-4 border-t border-border-subtle bg-canvas-subtle flex justify-end gap-3 shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
