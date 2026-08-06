import { useEffect, useState } from 'react';
import { get } from '../api/client';
import { useBranchFilter } from '../stores/branch';

export function ForecastPage() {
  const { queryParam } = useBranchFilter();
  const [demand, setDemand] = useState<Record<string, unknown>[]>([]);
  const [inv, setInv] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    const q = queryParam();
    get(`/v1/admin/forecast/demand${q ? `?${q}` : ''}`).then((r) => setDemand(((r as { forecasts: Record<string, unknown>[] }).forecasts) || []));
    get(`/v1/admin/forecast/inventory${q ? `?${q}` : ''}`).then((r) => setInv(((r as { suggestions: Record<string, unknown>[] }).suggestions) || []));
  }, [queryParam]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Forecast</h1>
        <p className="text-sm text-muted mt-1">Moving-average demand and reorder suggestions</p>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="panel overflow-hidden">
          <div className="px-4 py-3 section-label border-b border-border">Demand forecast (7d)</div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted"><tr><th className="px-4 py-2">Product</th><th className="px-4 py-2">Daily avg</th><th className="px-4 py-2">Forecast</th></tr></thead>
            <tbody>
              {demand.slice(0, 30).map((d) => (
                <tr key={String(d.product_id)} className="border-t border-border">
                  <td className="px-4 py-2">{String(d.name)}</td>
                  <td className="px-4 py-2">{String(d.daily_avg)}</td>
                  <td className="px-4 py-2 font-medium">{String(d.forecast_qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!demand.length && <div className="p-6 text-sm text-muted text-center">Need sales history</div>}
        </div>
        <div className="panel overflow-hidden">
          <div className="px-4 py-3 section-label border-b border-border">Reorder suggestions</div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted"><tr><th className="px-4 py-2">Product</th><th className="px-4 py-2">Cover (d)</th><th className="px-4 py-2">Reorder</th></tr></thead>
            <tbody>
              {inv.slice(0, 30).map((d) => (
                <tr key={String(d.product_id)} className={`border-t border-border ${d.urgent ? 'bg-warning-soft/40' : ''}`}>
                  <td className="px-4 py-2">{String(d.name)}</td>
                  <td className="px-4 py-2">{String(d.days_of_cover ?? '∞')}</td>
                  <td className="px-4 py-2 font-medium">{String(d.reorder_qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!inv.length && <div className="p-6 text-sm text-muted text-center">Stock looks healthy</div>}
        </div>
      </div>
    </div>
  );
}
