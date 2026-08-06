'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Home, Loader2, MessageCircle, Send } from 'lucide-react';
import { useRef, useState } from 'react';
import { askCoach, type QuotaState } from '@/lib/api';
import { useGameStore } from '@/store/useGameStore';

/**
 * Post-round coaching.
 *
 * Two layers, deliberately separate:
 *
 *   1. The home substitution, straight from the catalogue. No network, no
 *      model, no key - it renders for every player on every deployment. The
 *      game tells you to go and do the exercise, and that instruction is
 *      worthless to anyone without a barbell.
 *   2. The question box, which calls a model. Strictly additive: if it is not
 *      configured or the request fails, layer 1 is untouched.
 *
 * Built in that order on purpose. A feature that only works when someone has
 * paid for an API key should not be the thing standing between a player and
 * knowing how to do the movement.
 */

const SUGGESTIONS = ['What am I likely doing wrong?', 'How do I make it easier?', 'What should it feel like?'];

interface Exchange {
  question: string;
  answer: string;
  failed: boolean;
}

export function FormCoach() {
  const reveal = useGameStore((s) => s.reveal);
  const serverState = useGameStore((s) => s.serverState);
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [quota, setQuota] = useState<QuotaState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!reveal) return null;

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || !serverState) return;

    setBusy(true);
    setQuestion('');
    const result = await askCoach(trimmed, serverState);
    setBusy(false);

    if (!result.ok) {
      setHistory((h) => [...h, { question: trimmed, answer: result.error, failed: true }]);
      return;
    }
    if (result.data.status === 'unconfigured') {
      // Hide the box entirely rather than let the player keep asking a
      // question nothing is listening to.
      setDisabled(true);
      return;
    }
    if (result.data.quota) setQuota(result.data.quota);
    setHistory((h) => [
      ...h,
      { question: trimmed, answer: result.data.text, failed: result.data.status !== 'ok' },
    ]);
  }

  return (
    <div className="flex flex-col gap-3">
      {reveal.homeVersion ? (
        <div className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-inset ring-white/10">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
            <Home className="h-3.5 w-3.5" />
            No {reveal.equipment.toLowerCase()}? Do this instead
          </p>
          <p className="mt-1.5 text-sm font-semibold text-white">{reveal.homeVersion.name}</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-300">{reveal.homeVersion.howTo}</p>
        </div>
      ) : null}

      {disabled ? null : (
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {history.map((x, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-1.5"
              >
                <p className="self-end rounded-lg rounded-br-sm bg-white/[0.08] px-3 py-1.5 text-sm text-slate-200">
                  {x.question}
                </p>
                <p
                  className={[
                    'rounded-lg rounded-bl-sm px-3 py-2 text-sm leading-relaxed',
                    x.failed ? 'bg-state-excluded/20 text-rose-200' : 'bg-surface-2 text-slate-200',
                  ].join(' ')}
                >
                  {x.answer}
                </p>
              </motion.div>
            ))}
          </AnimatePresence>

          {history.length === 0 && !busy ? (
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-slate-300 transition-colors hover:bg-white/[0.12] hover:text-white"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(question);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <MessageCircle className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                ref={inputRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={400}
                disabled={busy || quota?.remaining === 0}
                placeholder={
                  quota?.remaining === 0 ? 'Back tomorrow' : `Ask about ${reveal.display}`
                }
                aria-label={`Ask a question about ${reveal.display}`}
                className="w-full rounded-lg bg-white/[0.06] py-2 pr-3 pl-8 text-sm text-white placeholder:text-slate-500 focus:ring-2 focus:ring-state-correct/50 focus:outline-none disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={busy || !question.trim() || quota?.remaining === 0}
              aria-label="Send question"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-white transition-colors hover:bg-white/[0.16] disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </form>

          {quota ? (
            <p className="text-[11px] text-slate-500">
              {quota.remaining > 0
                ? `${quota.remaining} of ${quota.limit} questions left today`
                : 'Out of questions until midnight UTC'}
              {quota.tier === 'anonymous' ? ' · sign in for more' : ''}
            </p>
          ) : null}

          <p className="text-[10px] leading-snug text-slate-500">
            Coaching cues only, and it cannot see you. Anything that hurts is a question for a
            physio, not a word game.
          </p>
        </div>
      )}
    </div>
  );
}
