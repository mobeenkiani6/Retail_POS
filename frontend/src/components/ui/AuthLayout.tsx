import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

type AuthLayoutProps = {
  children: ReactNode;
  title: string;
  subtitle?: string;
  badge?: string;
};

export default function AuthLayout({ children, title, subtitle, badge }: AuthLayoutProps) {
  const { toggleTheme, isDark } = useTheme();

  return (
    <div className="min-h-screen relative overflow-hidden bg-canvas">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-accent-500/10 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full bg-accent-600/8 blur-[100px]" />
        <div
          className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="absolute top-6 right-6 z-20 p-2.5 rounded-xl bg-surface/80 backdrop-blur border border-border shadow-soft hover:shadow-elevated transition-all text-muted hover:text-foreground"
        aria-label="Toggle theme"
      >
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>

      <div className="relative z-10 min-h-screen flex">
        {/* Left panel — branding */}
        <div className="hidden lg:flex lg:w-[480px] xl:w-[540px] flex-col justify-between p-12 border-r border-border bg-surface/50 backdrop-blur-sm">
          <div>
            <div className="flex items-center gap-3 mb-16">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center shadow-glow">
                <img src="/logo-removebg-preview.png" alt="Logo" className="w-7 h-7 object-contain" onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).parentElement!.innerHTML = '<span class="text-white font-bold text-lg">N</span>';
                }} />
              </div>
              <div>
                <p className="font-semibold text-foreground tracking-tight">Nycto Retail</p>
                <p className="text-xs text-muted">Enterprise POS Platform</p>
              </div>
            </div>

            <h1 className="text-3xl xl:text-4xl font-bold text-foreground leading-tight tracking-tight mb-4">
              Retail operations,<br />
              <span className="text-gradient">reimagined.</span>
            </h1>
            <p className="text-muted text-base leading-relaxed max-w-sm">
              Inventory, checkout, supply chain, and analytics — unified in one premium platform built for modern retail.
            </p>
          </div>

          <div className="space-y-4">
            {[
              { label: 'FEFO batch tracking', desc: 'Expiry-aware inventory management' },
              { label: 'Single-branch scope', desc: 'Hex ID linked to your admin panel' },
              { label: 'Real-time analytics', desc: 'Sales, margins, and health metrics' },
            ].map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="flex items-start gap-3"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-accent-500 mt-2 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right panel — form */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="w-full max-w-[440px]"
          >
            {badge && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-accent-50 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400 border border-accent-200/50 dark:border-accent-800/50 mb-6">
                {badge}
              </span>
            )}
            <h2 className="text-2xl font-bold text-foreground tracking-tight mb-1">{title}</h2>
            {subtitle && <p className="text-sm text-muted mb-8">{subtitle}</p>}
            {children}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
