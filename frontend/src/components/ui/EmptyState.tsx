import { type LucideIcon } from 'lucide-react';
import Button from './Button';

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
};

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-accent-50 dark:bg-accent-900/30 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-accent-500" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
      {description && <p className="text-sm text-muted max-w-sm mb-5">{description}</p>}
      {action && (
        <Button onClick={action.onClick} size="sm">{action.label}</Button>
      )}
    </div>
  );
}
