'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { useGameStore } from '@/store/useGameStore';

export function Toast() {
  const toast = useGameStore((s) => s.toast);
  const clearToast = useGameStore((s) => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, 2200);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            className="rounded-lg bg-white px-4 py-2.5 text-center text-sm font-bold text-slate-900 shadow-lg shadow-black/40"
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
