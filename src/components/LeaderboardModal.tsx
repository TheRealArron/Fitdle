'use client';

import { Leaderboard } from './Leaderboard';
import { Modal } from './Modal';

interface LeaderboardModalProps {
  open: boolean;
  onClose: () => void;
  /** Bumped after a win so the board reloads and the player sees themselves move. */
  refreshKey?: number;
}

export function LeaderboardModal({ open, onClose, refreshKey }: LeaderboardModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Leaderboard">
      {open ? <Leaderboard refreshKey={refreshKey} /> : null}
    </Modal>
  );
}
