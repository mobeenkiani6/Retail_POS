import { type LucideIcon } from 'lucide-react';

type StatCardProps = {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  trend?: string;
};

export default function StatCard({ label, value, sub, icon: Icon, trend }: StatCardProps) {
  return (
    <div className="p-5 rounded-2xl bg-surface border border-border shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-1 tracking-tight">{value}</p>
          {(sub || trend) && <p className="text-xs text-muted mt-1">{trend || sub}</p>}
        </div>
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-accent-50 dark:bg-accent-900/30 flex items-center justify-center text-accent-600">
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
}
