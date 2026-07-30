'use client';

import { Check, Copy, Download, HardDrive, Upload } from 'lucide-react';
import { useState } from 'react';
import { exportSave, importSave } from '@/lib/secureStorage';
import { useGameStore } from '@/store/useGameStore';
import { Modal } from './Modal';

interface AccountModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * There is no account system, and this does not pretend otherwise.
 *
 * A "Sign in" button that does nothing — or worse, a fake one that appears to
 * work — is a lie the player discovers later when their streak is gone. Instead
 * this states plainly where progress lives and hands over a backup code, which
 * solves the actual problem someone signing in would be trying to solve:
 * getting their streak onto another device.
 */
export function AccountModal({ open, onClose }: AccountModalProps) {
  const save = useGameStore((s) => s.save);
  const initGame = useGameStore((s) => s.initGame);
  const setToast = useGameStore((s) => s.setToast);

  const [copied, setCopied] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const backupCode = exportSave(save);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(backupCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setToast('Could not copy — select the code and copy manually');
    }
  };

  const onImport = () => {
    const result = importSave(code);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setError(null);
    setCode('');
    setShowImport(false);
    initGame();
    setToast('Progress restored');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Account & backup">
      <div className="flex flex-col gap-5">
        <section className="flex gap-3 rounded-xl bg-white/5 p-3 ring-1 ring-inset ring-white/10">
          <HardDrive className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden />
          <div className="text-sm leading-relaxed text-slate-300">
            <p className="mb-1 font-semibold text-white">Progress is stored on this device</p>
            <p className="text-slate-400">
              Fitdle has no accounts and no server, so nothing you do here is uploaded anywhere.
              Clearing your browser data, or opening the game in a different browser, starts you
              from zero. Use a backup code to move your streak.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">
            <Download className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
            Back up
          </h3>
          <p className="text-xs text-slate-400">
            {save.played === 0
              ? 'Nothing to back up yet — play a puzzle first.'
              : `${save.played} played · ${save.wins} won · streak ${save.streak}`}
          </p>
          <textarea
            readOnly
            value={backupCode}
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Backup code"
            className="w-full resize-none break-all rounded-lg bg-black/30 p-2.5 font-game text-[10px] leading-relaxed text-slate-300 ring-1 ring-inset ring-white/10 outline-none focus:ring-state-correct/50"
          />
          <button
            type="button"
            onClick={onCopy}
            className="flex items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10"
          >
            {copied ? <Check className="h-4 w-4 text-state-correct" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy backup code'}
          </button>
        </section>

        <section className="flex flex-col gap-2 border-t border-white/10 pt-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">
            <Upload className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
            Restore
          </h3>
          {showImport ? (
            <>
              <textarea
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setError(null);
                }}
                rows={3}
                placeholder="Paste a backup code…"
                aria-label="Paste backup code"
                className="w-full resize-none break-all rounded-lg bg-black/30 p-2.5 font-game text-[10px] leading-relaxed text-white ring-1 ring-inset ring-white/10 outline-none placeholder:font-sans placeholder:text-slate-500 focus:ring-state-correct/50"
              />
              {error && <p className="text-xs text-rose-400">{error}</p>}
              <p className="text-xs text-slate-500">
                This replaces everything currently stored on this device.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onImport}
                  disabled={!code.trim()}
                  className="flex-1 rounded-xl bg-state-correct px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-40"
                >
                  Restore progress
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowImport(false);
                    setError(null);
                  }}
                  className="flex-1 rounded-xl bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-300 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="rounded-xl bg-white/5 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10"
            >
              Enter a backup code
            </button>
          )}
        </section>
      </div>
    </Modal>
  );
}
