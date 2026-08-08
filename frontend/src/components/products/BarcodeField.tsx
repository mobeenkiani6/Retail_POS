import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, ScanBarcode, Keyboard, AlertTriangle, X } from 'lucide-react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { get, post } from '../../api';
import { getBranchId } from '../../branch';
import {
  validateBarcode,
  type BarcodeCheckResult,
  type ExistingBarcodeProduct,
} from '../../utils/barcode';

type Props = {
  value: string;
  onChange: (barcode: string) => void;
  excludeSkuId?: number;
  isEditing?: boolean;
  onExistingProduct?: (product: ExistingBarcodeProduct) => void;
  disabled?: boolean;
  label?: string;
};

type Status =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; message: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'taken'; message: string; existing: ExistingBarcodeProduct };

export default function BarcodeField({
  value,
  onChange,
  excludeSkuId,
  isEditing,
  onExistingProduct,
  disabled,
  label = 'Barcode',
}: Props) {
  const [mode, setMode] = useState<'manual' | 'scan'>('manual');
  const [scanOpen, setScanOpen] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [scanBuffer, setScanBuffer] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [cameraError, setCameraError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopCamera = useCallback(() => {
    if (detectTimer.current) {
      clearInterval(detectTimer.current);
      detectTimer.current = null;
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  const runCheck = useCallback(async (code: string) => {
    const local = validateBarcode(code);
    if (!local.ok) {
      setStatus({ kind: 'invalid', message: local.error || 'Invalid barcode format' });
      return;
    }
    if (!local.normalized) {
      setStatus({ kind: 'ok', message: 'No barcode — allowed for unpackaged products' });
      return;
    }
    setStatus({ kind: 'checking' });
    try {
      const branchId = getBranchId();
      const res = await post<BarcodeCheckResult>('/products/check-barcode', {
        barcode: local.normalized,
        exclude_sku_id: excludeSkuId,
        branch_id: branchId,
      });
      if (!res?.valid) {
        setStatus({ kind: 'invalid', message: res?.message || 'Invalid barcode format' });
        return;
      }
      if (!res.available && res.existing) {
        setStatus({ kind: 'taken', message: res.message, existing: res.existing });
        return;
      }
      setStatus({ kind: 'ok', message: 'Valid barcode · available' });
    } catch {
      setStatus({ kind: 'ok', message: 'Barcode format looks valid' });
    }
  }, [excludeSkuId, onExistingProduct]);

  useEffect(() => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    if (!value.trim()) {
      setStatus({ kind: 'idle' });
      return;
    }
    checkTimer.current = setTimeout(() => runCheck(value), 400);
    return () => {
      if (checkTimer.current) clearTimeout(checkTimer.current);
    };
  }, [value, runCheck]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const applyBarcode = async (raw: string) => {
    const local = validateBarcode(raw);
    onChange(local.normalized);
    setScanBuffer('');
    setScanOpen(false);
    stopCamera();
    if (!local.ok) {
      setStatus({ kind: 'invalid', message: local.error || 'Invalid barcode format' });
      return;
    }
    if (!local.normalized) return;
    setStatus({ kind: 'ok', message: 'Barcode captured successfully' });
    try {
      const branchId = getBranchId();
      const res = await post<BarcodeCheckResult>('/products/check-barcode', {
        barcode: local.normalized,
        exclude_sku_id: excludeSkuId,
        branch_id: branchId,
      });
      if (!res?.available && res?.existing) {
        setStatus({ kind: 'taken', message: res.message, existing: res.existing });
        onExistingProduct?.(res.existing);
      } else if (res?.valid) {
        setStatus({ kind: 'ok', message: 'Barcode captured successfully · available' });
      }
    } catch {
      /* keep captured success */
    }
  };

  const openScan = () => {
    setMode('scan');
    setScanBuffer('');
    setCameraError('');
    setScanOpen(true);
    setTimeout(() => scanInputRef.current?.focus(), 80);
  };

  const startCamera = async () => {
    setCameraError('');
    const BD = (window as unknown as {
      BarcodeDetector?: new (opts?: { formats?: string[] }) => {
        detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
      };
    }).BarcodeDetector;

    if (!BD) {
      setCameraError('Camera barcode scanning is not supported in this browser. Use a USB scanner or enter manually.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      const detector = new BD({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
      });
      detectTimer.current = setInterval(async () => {
        const v = videoRef.current;
        if (!v || v.readyState < 2) return;
        try {
          const codes = await detector.detect(v);
          if (codes?.[0]?.rawValue) {
            applyBarcode(codes[0].rawValue);
          }
        } catch {
          /* frame skip */
        }
      }, 400);
    } catch {
      setCameraError('Could not access camera. Check permissions, or use a USB barcode scanner.');
    }
  };

  const onScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (scanBuffer.trim().length >= 3) applyBarcode(scanBuffer);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-muted">{label}</label>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs font-semibold">
          <button
            type="button"
            disabled={disabled}
            onClick={openScan}
            className={`px-2.5 py-1.5 inline-flex items-center gap-1 ${mode === 'scan' ? 'bg-accent-600 text-white' : 'bg-surface text-muted hover:bg-canvas-subtle'}`}
          >
            <ScanBarcode className="w-3.5 h-3.5" /> Scan
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setMode('manual');
              inputRef.current?.focus();
            }}
            className={`px-2.5 py-1.5 inline-flex items-center gap-1 border-l border-border ${mode === 'manual' ? 'bg-accent-600 text-white' : 'bg-surface text-muted hover:bg-canvas-subtle'}`}
          >
            <Keyboard className="w-3.5 h-3.5" /> Manual
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          onBlur={e => {
            const v = validateBarcode(e.target.value);
            if (v.normalized !== e.target.value) onChange(v.normalized);
          }}
          placeholder="e.g. 8964001234567"
          className="input-base w-full font-mono text-sm"
          autoComplete="off"
          inputMode="text"
        />
        <Button type="button" variant="secondary" onClick={openScan} disabled={disabled} className="shrink-0">
          <ScanBarcode className="w-4 h-4" />
          {isEditing ? 'Scan New' : 'Scan'}
        </Button>
      </div>

      {status.kind === 'checking' && <p className="text-xs text-muted">Checking barcode…</p>}
      {status.kind === 'ok' && (
        <p className="text-xs text-success inline-flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" /> {status.message}
        </p>
      )}
      {status.kind === 'invalid' && (
        <p className="text-xs text-danger inline-flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" /> {status.message}
        </p>
      )}
      {status.kind === 'taken' && (
        <div className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning space-y-1">
          <p className="font-semibold inline-flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Barcode already assigned to another product
          </p>
          <p className="text-foreground-secondary whitespace-pre-line">{status.message}</p>
          {status.existing?.product_id && onExistingProduct && (
            <button
              type="button"
              className="text-accent-600 font-semibold hover:underline"
              onClick={() => onExistingProduct(status.existing)}
            >
              View existing product
            </button>
          )}
        </div>
      )}
      <p className="text-[11px] text-muted">
        Optional for unpackaged goods. Manufacturer barcodes must be unique.
      </p>

      <Modal
        open={scanOpen}
        onClose={() => {
          setScanOpen(false);
          stopCamera();
        }}
        title="Scan Barcode"
        description="Use a USB/Bluetooth scanner, or enable the camera where available."
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setScanOpen(false);
                stopCamera();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (scanBuffer.trim().length >= 3) applyBarcode(scanBuffer);
              }}
              disabled={scanBuffer.trim().length < 3}
            >
              Use Barcode
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted mb-1.5 block">
              Point scanner here (auto-focus)
            </label>
            <input
              ref={scanInputRef}
              value={scanBuffer}
              onChange={e => setScanBuffer(e.target.value)}
              onKeyDown={onScanKeyDown}
              placeholder="Waiting for scan…"
              className="input-base w-full font-mono text-lg tracking-wide"
              autoFocus
              autoComplete="off"
            />
            <p className="text-xs text-muted mt-1.5">
              Most retail scanners type the code and press Enter automatically.
            </p>
          </div>

          <div className="rounded-xl border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold inline-flex items-center gap-1.5">
                <Camera className="w-4 h-4" /> Camera scanner
              </p>
              {!cameraOn ? (
                <Button type="button" variant="secondary" size="sm" onClick={startCamera}>
                  Enable camera
                </Button>
              ) : (
                <button
                  type="button"
                  onClick={stopCamera}
                  className="text-xs text-muted hover:text-danger inline-flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> Stop
                </button>
              )}
            </div>
            {cameraError && <p className="text-xs text-warning">{cameraError}</p>}
            {cameraOn && (
              <video
                ref={videoRef}
                className="w-full rounded-lg bg-black aspect-video object-cover"
                muted
                playsInline
              />
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** Lightweight lookup helper for GRN / receiving. */
export async function lookupBarcode(barcode: string) {
  const code = validateBarcode(barcode).normalized;
  if (!code) throw new Error('Barcode is required');
  const branchId = getBranchId();
  return get<{
    product_id: number;
    sku_id: number;
    name: string;
    product_name: string;
    sku_code: string;
    barcode: string;
    selling_price: number;
    cost_price: number;
    stock_level?: number | null;
    display_label?: string;
  }>(`/products/barcode/${encodeURIComponent(code)}?branch_id=${branchId}`);
}
