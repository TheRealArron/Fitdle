'use client';

import {
  Check,
  CircleAlert,
  CloudCheck,
  CloudOff,
  Copy,
  HardDrive,
  LoaderCircle,
  LogOut,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { exportSave, importSave } from '@/lib/secureStorage';
import { useAuthStore } from '@/store/useAuthStore';
import { useGameStore } from '@/store/useGameStore';
import { Modal } from './Modal';

interface AccountModalProps {
  open: boolean;
  onClose: () => void;
}

type Tab = 'signin' | 'signup';

/**
 * Account panel.
 *
 * When Supabase keys are present this is a real login: sign up, sign in, sign
 * out, and a streak that follows you between devices. When they are absent -
 * a fresh clone, or the extension build - the same panel says so plainly and
 * falls back to a backup code, because a sign-in form that cannot reach a
 * server is worse than no sign-in form at all.
 */
export function AccountModal({ open, onClose }: AccountModalProps) {
  const cloudAvailable = useAuthStore((s) => s.cloudAvailable);
  const user = useAuthStore((s) => s.user);
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const notice = useAuthStore((s) => s.notice);
  const syncState = useAuthStore((s) => s.syncState);
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const signOut = useAuthStore((s) => s.signOut);
  const syncNow = useAuthStore((s) => s.syncNow);
  const clearError = useAuthStore((s) => s.clearError);

  const save = useGameStore((s) => s.save);
  const initGame = useGameStore((s) => s.initGame);
  const setToast = useGameStore((s) => s.setToast);

  const [tab, setTab] = useState<Tab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');

  const [showBackup, setShowBackup] = useState(false);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  useEffect(() => {
    if (open) clearError();
  }, [open, tab, clearError]);

  const backupCode = exportSave(save);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok =
      tab === 'signin' ? await signIn(email, password) : await signUp(email, password, username);
    if (ok) setPassword('');
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(backupCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setToast('Could not copy - select the code and copy manually');
    }
  };

  const onImport = () => {
    const result = importSave(code);
    if (!result.ok) {
      setCodeError(result.reason);
      return;
    }
    setCodeError(null);
    setCode('');
    initGame();
    setToast('Progress restored');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={user ? 'Your account' : 'Account'}>
      <div className="flex flex-col gap-5">
        {/* ── signed in ── */}
        {user ? (
          <>
            <section className="panel-raised flex items-center gap-3 rounded-xl p-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-dim text-accent">
                <span className="font-game text-sm font-bold uppercase">
                  {user.username.slice(0, 2)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{user.username}</p>
                <p className="truncate text-xs text-slate-500">{user.email}</p>
                <p className="flex items-center gap-1.5 text-xs text-slate-400">
                  {syncState === 'syncing' ? (
                    <>
                      <LoaderCircle className="h-3 w-3 animate-spin" /> Syncing…
                    </>
                  ) : syncState === 'error' ? (
                    <>
                      <CloudOff className="h-3 w-3 text-amber-400" /> Sync failed - playing locally
                    </>
                  ) : (
                    <>
                      <CloudCheck className="h-3 w-3 text-accent" /> Streak synced to the cloud
                    </>
                  )}
                </p>
              </div>
            </section>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Streak', value: save.streak },
                { label: 'Best', value: save.maxStreak },
                { label: 'Played', value: save.played },
              ].map((s) => (
                <div key={s.label} className="panel-raised rounded-xl py-2.5 text-center">
                  <p className="numeric text-lg font-bold text-white">{s.value}</p>
                  <p className="label text-[9px]">{s.label}</p>
                </div>
              ))}
            </div>

            {error && (
              <p className="flex items-start gap-2 text-xs text-amber-400">
                <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void syncNow()}
                disabled={syncState === 'syncing'}
                className="btn btn-ghost flex-1"
              >
                <RefreshCw
                  className={`h-4 w-4 ${syncState === 'syncing' ? 'animate-spin' : ''}`}
                />
                Sync now
              </button>
              <button
                type="button"
                onClick={() => void signOut()}
                disabled={busy}
                className="btn btn-ghost flex-1"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </>
        ) : cloudAvailable ? (
          /* ── signed out, cloud available ── */
          <>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
              {(['signin', 'signup'] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={[
                    'rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                    tab === t ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white',
                  ].join(' ')}
                >
                  {t === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            <p className="text-xs leading-relaxed text-slate-400">
              An account keeps your streak on every device you play on. That is all it
              stores: a username, an email, and your progress. No tracking, no leaderboard,
              nothing shared with anyone.
            </p>

            <form onSubmit={submit} className="flex flex-col gap-3">
              {tab === 'signup' && (
                <label className="flex flex-col gap-1.5">
                  <span className="label">Username</span>
                  <input
                    type="text"
                    required
                    maxLength={20}
                    autoComplete="nickname"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="How you want to be known"
                    className="field"
                  />
                  <span className="text-xs text-slate-500">
                    Shown in the menu. Nobody else sees it - there is no leaderboard.
                  </span>
                </label>
              )}
              <label className="flex flex-col gap-1.5">
                <span className="label">Email</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="field"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="label">Password</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="field"
                />
              </label>

              {error && (
                <p className="flex items-start gap-2 text-xs text-rose-400">
                  <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              )}
              {notice && (
                <p className="flex items-start gap-2 text-xs text-accent">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {notice}
                </p>
              )}

              <button type="submit" disabled={busy} className="btn btn-primary w-full">
                {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {tab === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            <p className="text-xs leading-relaxed text-slate-500">
              Signing in merges whatever you have played on this device with your account - you
              will not lose the streak you already have.
            </p>
          </>
        ) : (
          /* ── no backend configured ── */
          <section className="flex gap-3 rounded-xl bg-surface-2 p-3.5 ring-1 ring-inset ring-white/[0.08]">
            <HardDrive className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden />
            <div className="text-sm leading-relaxed text-slate-300">
              <p className="mb-1 font-semibold text-white">Accounts are not set up</p>
              <p className="text-slate-400">
                This build has no cloud backend, so progress lives in this browser only. See{' '}
                <span className="font-game text-slate-300">.env.example</span> to switch cloud
                sync on. Until then, use a backup code to move your streak.
              </p>
            </div>
          </section>
        )}

        {/* ── backup code: always available, secondary once accounts exist ── */}
        <section className="flex flex-col gap-2 border-t border-white/[0.07] pt-4">
          {showBackup ? (
            <>
              <h3 className="label">Backup code</h3>
              <p className="text-xs leading-relaxed text-slate-500">
                A snapshot of your progress you can paste into another browser. Restoring
                replaces whatever is stored here.
              </p>
              <textarea
                readOnly
                value={backupCode}
                rows={3}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Backup code"
                className="field resize-none break-all font-game text-[11px] leading-relaxed"
              />
              <button type="button" onClick={onCopy} className="btn btn-ghost w-full">
                {copied ? (
                  <Check className="h-4 w-4 text-accent" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied ? 'Copied' : 'Copy code'}
              </button>

              <textarea
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setCodeError(null);
                }}
                rows={2}
                placeholder="…or paste a code here to restore"
                aria-label="Paste backup code"
                className="field mt-1 resize-none break-all font-game text-[11px] leading-relaxed"
              />
              {codeError && <p className="text-xs text-rose-400">{codeError}</p>}
              <button
                type="button"
                onClick={onImport}
                disabled={!code.trim()}
                className="btn btn-ghost w-full"
              >
                <Upload className="h-4 w-4" />
                Restore from code
              </button>
            </>
          ) : (
            // Padded to a real tap target. As bare text this was 16px tall -
            // under the ~24px minimum, awkward on touch, and a synthetic click
            // could miss it entirely.
            <button
              type="button"
              onClick={() => setShowBackup(true)}
              className="rounded-lg px-3 py-2.5 text-center text-xs text-slate-500 transition-colors hover:bg-white/[0.05] hover:text-slate-300"
            >
              {cloudAvailable && user
                ? 'Export a backup code instead'
                : 'Use a backup code'}
            </button>
          )}
        </section>
      </div>
    </Modal>
  );
}
