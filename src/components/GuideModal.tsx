'use client';

import { GuideChat } from './GuideChat';
import { Modal } from './Modal';

interface GuideModalProps {
  open: boolean;
  onClose: () => void;
}

export function GuideModal({ open, onClose }: GuideModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Ask the guide">
      {open ? <GuideChat /> : null}
    </Modal>
  );
}
