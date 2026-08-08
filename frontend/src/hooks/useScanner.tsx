import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

interface ScannerContextType {
  lastScannedBarcode: string | null;
  clearBarcode: () => void;
  scannerStatus: 'waiting' | 'active' | 'idle';
}

const ScannerContext = createContext<ScannerContextType | undefined>(undefined);

/** Max gap between keystrokes still treated as one USB-wedge scan (ms). */
const SCAN_KEY_GAP_MS = 120;
const MIN_BARCODE_LEN = 3;

export const ScannerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string | null>(null);

  // Scanner status:
  //   'waiting' — no scan has been detected yet
  //   'active'  — a scan was detected recently
  //   'idle'    — was active but quiet for a while
  const [scannerStatus, setScannerStatus] = useState<'waiting' | 'active' | 'idle'>('waiting');
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  const markActive = () => {
    setScannerStatus('active');
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setScannerStatus('idle');
    }, 60000);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;

      // Don't hijack password / multiline / select fields
      if (tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (tag === 'INPUT') {
        const type = (el as HTMLInputElement).type || 'text';
        if (['password', 'number', 'checkbox', 'radio', 'file', 'date', 'email'].includes(type)) {
          return;
        }
      }

      const now = Date.now();

      if (e.key === 'Enter') {
        const code = bufferRef.current.trim();
        bufferRef.current = '';
        if (code.length >= MIN_BARCODE_LEN) {
          // Capture-phase: stop React/input Enter handlers so we don't double-add
          e.preventDefault();
          e.stopImmediatePropagation();
          setLastScannedBarcode(code);
          markActive();
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (now - lastKeyTimeRef.current > SCAN_KEY_GAP_MS) {
          bufferRef.current = e.key;
        } else {
          bufferRef.current += e.key;
        }
        lastKeyTimeRef.current = now;
      } else if (e.key === 'Backspace') {
        bufferRef.current = '';
      }
    };

    // Capture phase so scans work even when SearchInput is focused (autoFocus on Checkout)
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  const clearBarcode = () => {
    setLastScannedBarcode(null);
  };

  return (
    <ScannerContext.Provider value={{ lastScannedBarcode, clearBarcode, scannerStatus }}>
      {children}
    </ScannerContext.Provider>
  );
};

export const useScanner = () => {
  const context = useContext(ScannerContext);
  if (context === undefined) {
    throw new Error('useScanner must be used within a ScannerProvider');
  }
  return context;
};
