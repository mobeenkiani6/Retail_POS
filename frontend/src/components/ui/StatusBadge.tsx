import Badge from './Badge';

const statusMap: Record<string, { label: string; variant: 'default' | 'accent' | 'success' | 'warning' | 'danger' }> = {
  active: { label: 'Active', variant: 'success' },
  near_expiry: { label: 'Near Expiry', variant: 'warning' },
  expired: { label: 'Expired', variant: 'danger' },
  depleted: { label: 'Depleted', variant: 'default' },
  draft: { label: 'Draft', variant: 'default' },
  received: { label: 'Received', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
  pending: { label: 'Pending', variant: 'warning' },
  synced: { label: 'Synced', variant: 'success' },
};

export default function StatusBadge({ status }: { status: string }) {
  const cfg = statusMap[status] || { label: status, variant: 'default' as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
