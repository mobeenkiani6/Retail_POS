type SkeletonProps = {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
};

export default function Skeleton({ className = '', variant = 'rectangular' }: SkeletonProps) {
  const base = 'animate-shimmer rounded-lg';
  const variants = {
    text: 'h-4 w-full',
    circular: 'rounded-full',
    rectangular: 'h-12 w-full',
  };
  return <div className={`${base} ${variants[variant]} ${className}`} />;
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="p-4 border-b border-border-subtle flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" variant="text" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="p-4 border-b border-border-subtle flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" variant="text" />
          ))}
        </div>
      ))}
    </div>
  );
}
