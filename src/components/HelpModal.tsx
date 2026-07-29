'use client';

import { CATEGORY_HINT_AT, EQUIPMENT_HINT_AT, MAX_GUESSES, CATALOGUE } from '@/data/exercises';
import type { LetterState } from '@/lib/evaluate';
import { Modal } from './Modal';

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

const FACE: Record<LetterState | 'empty', string> = {
  correct: 'bg-state-correct border-state-correct',
  present: 'bg-state-present border-state-present',
  absent: 'bg-state-absent border-state-absent',
  empty: 'border-tile-filled bg-tile-empty',
};

function MiniRow({ word, highlight, state }: { word: string; highlight: number; state: LetterState }) {
  return (
    <div className="flex gap-1">
      {word.split('').map((c, i) => (
        <div
          key={i}
          className={[
            'flex h-8 w-8 items-center justify-center rounded border-2 font-game text-sm font-bold text-white',
            i === highlight ? FACE[state] : FACE.empty,
          ].join(' ')}
        >
          {c}
        </div>
      ))}
    </div>
  );
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3.5 w-3.5 shrink-0 rounded-sm ${className}`} aria-hidden />
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  );
}

export function HelpModal({ open, onClose }: HelpModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="How to play">
      <div className="flex flex-col gap-5 text-sm leading-relaxed text-slate-300">
        <p>
          Guess today&apos;s exercise in {MAX_GUESSES} tries. The grid width tells you how many
          letters it has — that changes daily.
        </p>

        <section className="rounded-lg bg-white/5 p-3">
          <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-500">
            Typing the names
          </h3>
          <p className="text-xs">
            Letters only, no spaces or hyphens, singular. Pull-ups is{' '}
            <span className="font-game text-white">PULLUP</span>, Farmer&apos;s carry is{' '}
            <span className="font-game text-white">FARMERS</span>. All {CATALOGUE.length} names are
            in the list icon at the top — you are not expected to know them by heart.
          </p>
        </section>

        <div className="flex flex-col gap-3 border-y border-white/10 py-5">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            1. Letter feedback
          </h3>
          <div className="flex flex-col gap-1.5">
            <MiniRow word="SQUAT" highlight={0} state="correct" />
            <p className="text-xs text-slate-400">
              <strong className="text-white">S</strong> is in the exercise and in the right spot.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <MiniRow word="PLANK" highlight={1} state="present" />
            <p className="text-xs text-slate-400">
              <strong className="text-white">L</strong> is in the exercise but in the wrong spot.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <MiniRow word="BRIDGE" highlight={3} state="absent" />
            <p className="text-xs text-slate-400">
              <strong className="text-white">D</strong> is not in the exercise anywhere.
            </p>
          </div>
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            2. Muscle feedback
          </h3>
          <p className="text-xs">
            The figure beside the board reacts to every guess. Guess SQUAT against a hidden
            DEADLIFT and the glutes light green while the quads go red — you have learned the
            answer is a posterior-chain movement without a single letter helping you.
          </p>
          <div className="mt-1 flex flex-col gap-1.5">
            <Swatch className="bg-state-correct" label="Your guess and the answer both work it" />
            <Swatch className="bg-[#7f1d3a]" label="Your guess works it, the answer does not" />
            <Swatch className="bg-tile-empty" label="Not probed yet — tells you nothing" />
          </div>
          <p className="text-xs text-slate-500">
            Muscles the answer works are never lit until one of your guesses touches them. The
            figure narrows the search; it never hands you the answer.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            3. Hints unlock as you go
          </h3>
          <p className="text-xs">
            Guess {CATEGORY_HINT_AT} reveals the muscle group. Guess {EQUIPMENT_HINT_AT} reveals
            the equipment. The first two guesses are yours alone — that is where the deduction
            lives.
          </p>
        </section>

        <p className="text-xs text-slate-500">
          A new exercise unlocks at midnight UTC and it is the same one for everybody. Solve it to
          extend your streak — miss a day and the streak resets.
        </p>
      </div>
    </Modal>
  );
}
