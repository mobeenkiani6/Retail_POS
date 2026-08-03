import { type ReactNode } from 'react';
import { motion } from 'framer-motion';

type CardProps = {
  children: ReactNode;
  className?: string;
  glass?: boolean;
};

export default function Card({ children, className = '', glass = false }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`rounded-2xl bg-surface border border-neutral-200/80 shadow-soft ${glass ? 'glass-card' : ''} ${className}`}
    >
      {children}
    </motion.div>
  );
}
