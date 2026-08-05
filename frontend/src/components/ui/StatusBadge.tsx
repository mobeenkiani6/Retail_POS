import Badge from './Badge';

const statusMap: Record<string, { label: string; variant: 'default' | 'accent' | 'success' | 'warning' | 'danger' }> = {
  active: { label: 'Active', variant: 'success' },
  inactive: { label: 'Inactive', variant: 'default' },
  near_expiry: { label: 'Near Expiry', variant: 'warning' },
  expired: { label: 'Expired', variant: 'danger' },
  depleted: { label: 'Depleted', variant: 'default' },
  draft: { label: 'Active', variant: 'accent' },
  received: { label: 'Completed', variant: 'success' },
  completed: { label: 'Completed', variant: 'success' },
  partial: { label: 'Partial', variant: 'warning' },
  cancelled: { label: 'Deleted', variant: 'danger' },
  deleted: { label: 'Deleted', variant: 'danger' },
  pending: { label: 'Pending', variant: 'warning' },
  synced: { label: 'Synced', variant: 'success' },
  refunded: { label: 'Refunded', variant: 'danger' },
  partially_returned: { label: 'Partially Returned', variant: 'warning' },
  held: { label: 'Held', variant: 'default' },
};

export default function StatusBadge({ status }: { status: string }) {
  const cfg = statusMap[status] || { label: status, variant: 'default' as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
