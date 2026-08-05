'use client';

import { AnatomyDrill } from './AnatomyDrill';
import { Modal } from './Modal';

interface DrillModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Houses the drill. Remounts on every open (via the `open` guard) so a run that
 * was abandoned mid-way does not resume with a stale countdown.
 */
export function DrillModal({ open, onClose }: DrillModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Anatomy drill">
      {open ? <AnatomyDrill /> : null}
    </Modal>
  );
}
