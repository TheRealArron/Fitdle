'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/** Everything inside the panel a keyboard can land on, in document order. */
function focusables(panel: HTMLElement): HTMLElement[] {
  return [
    ...panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((el) => el.offsetParent !== null);
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);

  /*
   * ── Focus, which `aria-modal` alone does not move ───────────────────────────
   *
   * Measured before this existed, with "How to play" open:
   *
   *   focus after opening   button("How to play")  inDialog=false
   *   one Tab               button("Exercise list") inDialog=false
   *   after Escape          button("Exercise list") inDialog=false
   *
   * So focus stayed on the trigger behind the overlay, one Tab walked out into
   * a page hidden behind a backdrop blur, and closing left focus wherever the
   * tabbing had wandered to. `aria-modal="true"` tells a screen reader to
   * constrain itself; it does nothing for a sighted keyboard user, who was
   * tabbing through controls they could not see.
   *
   * Three things, which is what a dialog owes a keyboard: move focus in, keep
   * it in, and give it back.
   */
  useEffect(() => {
    if (!open) return;

    const returnTo = document.activeElement as HTMLElement | null;
    const first = panel.current ? focusables(panel.current)[0] : null;
    (first ?? panel.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;

      const items = focusables(panel.current);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const edge = e.shiftKey ? items[0] : items[items.length - 1];
      // Wrap at the edge. Also catches focus that is outside the panel
      // entirely, which is where it starts if the panel had nothing to take it.
      if (document.activeElement === edge || !panel.current.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? items[items.length - 1] : items[0]).focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      // Back where they were, so closing a dialog does not lose their place.
      returnTo?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-void/80 p-3 backdrop-blur-md sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <motion.div
            ref={panel}
            tabIndex={-1}
            className="panel max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/[0.08] p-5 shadow-2xl shadow-black/70"
            initial={{ opacity: 0, y: 32, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="font-game text-lg font-bold tracking-wide text-white">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-m-1 rounded-md p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
