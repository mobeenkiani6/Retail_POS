import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search } from 'lucide-react';
import { get, put, post, getUserMessage } from '../../api';
import {
  useSettingsStore,
  normalizeHardware,
  type HardwareConfig,
  type PrinterConnectionType,
  type PrinterEndpointConfig,
} from '../../stores/settingsStore';

type SettingsResponse = { config?: Record<string, unknown> };

const CONNECTION_OPTIONS: { value: PrinterConnectionType; label: string }[] = [
  { value: 'lan', label: 'LAN (IP + Port)' },
  { value: 'usb', label: 'USB (Vendor/Product ID)' },
];

function ConnectionTypeSelect({
  value,
  onChange,
}: {
  value: PrinterConnectionType;
  onChange: (v: PrinterConnectionType) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = CONNECTION_OPTIONS.find(o => o.value === value) ?? CONNECTION_OPTIONS[0];
  const filtered = CONNECTION_OPTIONS.filter(o =>
    o.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQuery(''); }}
        className="input-base w-full flex items-center justify-between text-left"
      >
        <span>{selected.label}</span>
        <ChevronDown className={`w-4 h-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1.5 w-full rounded-xl border border-border bg-surface shadow-premium overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search connection types..."
                className="input-base w-full pl-9 py-2 text-sm"
              />
            </div>
          </div>
          <ul className="py-1 max-h-48 overflow-y-auto">
            {filtered.map(opt => (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-sm text-left transition-colors ${
                    value === opt.value
                      ? 'bg-accent-600 text-white'
                      : 'text-foreground hover:bg-canvas-subtle'
                  }`}
                >
                  <span>{opt.label}</span>
                  {value === opt.value && <Check className="w-4 h-4" />}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-2.5 text-sm text-muted">No matches</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function PrinterCard({
  title,
  config,
  onChange,
}: {
  title: string;
  config: PrinterEndpointConfig;
  onChange: (next: PrinterEndpointConfig) => void;
}) {
  const set = <K extends keyof PrinterEndpointConfig>(key: K, value: PrinterEndpointConfig[K]) =>
    onChange({ ...config, [key]: value });

  return (
    <div className="bg-canvas-subtle p-6 rounded-xl border border-border space-y-4">
      <h4 className="font-semibold text-foreground">{title}</h4>

      <div>
        <label className="block text-sm font-medium text-foreground-secondary mb-1.5">Connection Type</label>
        <ConnectionTypeSelect
          value={config.connection_type}
          onChange={v => set('connection_type', v)}
        />
      </div>

      {config.connection_type === 'lan' ? (
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <div>
            <label className="block text-sm font-medium text-foreground-secondary mb-1.5">Printer IP / Host</label>
            <input
              type="text"
              value={config.host}
              onChange={e => set('host', e.target.value)}
              placeholder="192.168.18.99"
              className="input-base w-full font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-secondary mb-1.5">Port</label>
            <input
              type="text"
              inputMode="numeric"
              value={config.port}
              onChange={e => set('port', e.target.value)}
              placeholder="9100"
              className="input-base w-full font-mono"
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-foreground-secondary mb-1.5">USB Vendor ID</label>
            <input
              type="text"
              value={config.printer_vendor_id}
              onChange={e => set('printer_vendor_id', e.target.value)}
              placeholder="e.g. 0x04b8"
              className="input-base w-full font-mono"
            />
            <p className="text-xs text-muted mt-1">Hex value, e.g. 0x04b8 for Epson</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-secondary mb-1.5">USB Product ID</label>
            <input
              type="text"
              value={config.printer_product_id}
              onChange={e => set('printer_product_id', e.target.value)}
              placeholder="e.g. 0x0202"
              className="input-base w-full font-mono"
            />
            <p className="text-xs text-muted mt-1">Hex value, e.g. 0x0202 for TM-T88</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HardwareSettings() {
  const { hardware, setHardware } = useSettingsStore();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  const syncLegacy = (next: HardwareConfig): HardwareConfig => ({
    ...next,
    printer_vendor_id: next.receipt_printer.printer_vendor_id,
    printer_product_id: next.receipt_printer.printer_product_id,
  });

  const patchHardware = (patch: Partial<HardwareConfig> | ((prev: HardwareConfig) => HardwareConfig)) => {
    setHardware(prev => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
      return syncLegacy(next);
    });
  };

  const fetchHardware = async () => {
    setLoading(true);
    try {
      const data = await get<SettingsResponse>('/settings/?global_only=1');
      const h = data.config?.hardware as Record<string, unknown> | undefined;
      setHardware(normalizeHardware(h));
    } catch {
      setHardware(normalizeHardware(null));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHardware(); }, []);

  const saveHardware = async () => {
    setSaving(true);
    setFeedback('');
    try {
      const existing = await get<SettingsResponse>('/settings/?global_only=1');
      const currentConfig = (existing?.config ?? {}) as Record<string, unknown>;
      const payload = syncLegacy(hardware);
      await put('/settings/', { config: { ...currentConfig, hardware: payload }, branch_id: null });
      setHardware(payload);
      setFeedback('Hardware settings saved!');
      setTimeout(() => setFeedback(''), 2000);
    } catch (e) {
      setFeedback('error:' + getUserMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleTestPrint = async () => {
    setTestLoading(true);
    setFeedback('');
    try {
      await saveHardware();
      const data = await post<{ success?: boolean; message?: string }>('/printer/test-print', {});
      if (data?.success) {
        setFeedback('Test print job sent successfully!');
      } else {
        setFeedback('error:' + (data?.message ?? 'Printer not reachable'));
      }
    } catch (e) {
      setFeedback('error:' + getUserMessage(e));
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h3 className="text-2xl font-bold text-foreground mb-2">Thermal Printer</h3>
      <p className="text-sm text-muted mb-6">
        Configure the receipt printer. LAN mode is recommended for network printers; USB remains available for local setups.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-muted py-10">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading hardware config…
        </div>
      ) : (
        <div className="space-y-6">
          <PrinterCard
            title="Order Receipt Printer"
            config={hardware.receipt_printer}
            onChange={receipt_printer => patchHardware({ receipt_printer })}
          />

          <div className="bg-canvas-subtle p-6 rounded-xl border border-border">
            <label className="block text-sm font-medium text-foreground-secondary mb-1.5">Paper Width</label>
            <select
              value={hardware.paper_width}
              onChange={e => patchHardware({ paper_width: e.target.value })}
              className="input-base w-full"
            >
              <option value="80mm">80mm</option>
              <option value="58mm">58mm</option>
            </select>
          </div>

          {feedback && (
            <div className={`text-sm font-medium rounded-lg px-4 py-3 border ${
              feedback.startsWith('error:')
                ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
                : 'bg-accent-500/10 text-accent-600 border-accent-500/30'
            }`}>
              {feedback.replace('error:', '')}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={saveHardware}
              disabled={saving}
              className="bg-accent-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-accent-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Hardware Config
            </button>
            <button
              type="button"
              onClick={handleTestPrint}
              disabled={testLoading || saving}
              className="bg-surface border text-foreground-secondary border-border px-6 py-2 rounded-lg text-sm font-medium hover:bg-canvas-subtle disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {testLoading && <Loader2 className="w-4 h-4 animate-spin text-muted" />}
              Test Print Connection
            </button>
          </div>

          <div className="bg-canvas-subtle p-6 rounded-xl border border-border text-sm">
            <h4 className="font-semibold text-foreground mb-2 border-b border-border pb-2">Barcode Scanner Tips</h4>
            <p className="text-muted mb-3">
              This POS supports standard USB barcode scanners acting as a <strong>keyboard wedge</strong>.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted">
              <li>Ensure the scanner is connected via USB to the POS terminal.</li>
              <li>The scanner must be configured to append a <strong>Carriage Return (Enter)</strong> after scanning payloads.</li>
              <li>No special driver installation is required within the app. Just plug, and start scanning!</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
