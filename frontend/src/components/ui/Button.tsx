import { type ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
};

const variants = {
  primary: 'bg-accent-600 hover:bg-accent-700 text-white shadow-sm shadow-accent-600/20 dark:shadow-accent-600/10',
  secondary: 'bg-surface border border-border hover:bg-canvas-subtle text-foreground',
  ghost: 'bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 text-foreground-secondary',
  danger: 'bg-danger hover:bg-red-600 text-white',
};

const sizes = {
  sm: 'px-3 py-2 text-xs min-h-9',
  md: 'px-4 py-2.5 text-sm min-h-10 touch-target',
  lg: 'px-6 py-3 text-base min-h-12 touch-target',
};

export default function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
