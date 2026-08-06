'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { askGuide } from '@/lib/api';

/**
 * The in-game guide.
 *
 * Available at any point in a round, which is only safe because the model it
 * talks to has never seen the exercise catalogue - see src/server/guide.ts.
 * There is no gate here because there is nothing to gate.
 */

const SUGGESTIONS = [
  'How does the muscle map work?',
  'What is the opening call?',
  'Why did my streak reset?',
];

interface Turn {
  question: string;
  answer: string;
  failed: boolean;
}

export function GuideChat() {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [history, busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setQuestion('');
    const result = await askGuide(trimmed);
    setBusy(false);

    if (!result.ok) {
      setHistory((h) => [...h, { question: trimmed, answer: result.error, failed: true }]);
      return;
    }
    if (result.data.status === 'unconfigured') {
      // Hide it rather than let someone keep asking a question nothing hears.
      setDisabled(true);
      return;
    }
    setHistory((h) => [
      ...h,
      { question: trimmed, answer: result.data.text, failed: result.data.status !== 'ok' },
    ]);
  }

  if (disabled) {
    return (
      <p className="py-6 text-center text-sm text-slate-400">
        The guide is not available on this deployment. How to play covers the rules.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] leading-snug text-slate-500">
        Ask how anything in the game works. It does not know today&rsquo;s answer and has no
        access to the exercise list, so it cannot hint even if you ask it to.
      </p>

      <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
        <AnimatePresence initial={false}>
          {history.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-1.5"
            >
              <p className="self-end rounded-lg rounded-br-sm bg-white/[0.08] px-3 py-1.5 text-sm text-slate-200">
                {t.question}
              </p>
              <p
                className={[
                  'rounded-lg rounded-bl-sm px-3 py-2 text-sm leading-relaxed',
                  t.failed ? 'bg-state-excluded/20 text-rose-200' : 'bg-surface-2 text-slate-200',
                ].join(' ')}
              >
                {t.answer}
              </p>
            </motion.div>
          ))}
        </AnimatePresence>
        {busy ? (
          <p className="flex items-center gap-2 px-1 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Thinking
          </p>
        ) : null}
        <div ref={endRef} />
      </div>

      {history.length === 0 && !busy ? (
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void send(s)}
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
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={300}
          disabled={busy}
          placeholder="How does the muscle map work?"
          aria-label="Ask the guide a question"
          className="flex-1 rounded-lg bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:ring-2 focus:ring-state-correct/50 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          aria-label="Send question"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-white transition-colors hover:bg-white/[0.16] disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
