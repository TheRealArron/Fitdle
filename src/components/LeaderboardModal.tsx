'use client';

import { Leaderboard } from './Leaderboard';
import { Modal } from './Modal';

interface LeaderboardModalProps {
  open: boolean;
  onClose: () => void;
  /** Changes when the round ends, so the board reloads with the new standing. */
  refreshKey?: string;
}

export function LeaderboardModal({ open, onClose, refreshKey }: LeaderboardModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Leaderboard">
      {open ? <Leaderboard refreshKey={refreshKey} /> : null}
    </Modal>
  );
}
