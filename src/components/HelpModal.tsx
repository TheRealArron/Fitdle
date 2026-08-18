'use client';

import { CATEGORY_HINT_AT, EQUIPMENT_HINT_AT, MAX_GUESSES, CATALOGUE } from '@/data/exercises';
import type { LetterState } from '@/lib/evaluate';
import { MuscleLegend } from './MuscleLegend';
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

export function HelpModal({ open, onClose }: HelpModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="How to play">
      <div className="flex flex-col gap-5 text-sm leading-relaxed text-slate-300">
        <p>
          Guess today&apos;s exercise in {MAX_GUESSES} tries. The grid width tells you how many
          letters it has - that changes daily.
        </p>

        <section className="panel-raised rounded-xl p-3">
          <h3 className="label mb-1.5">
            Typing the names
          </h3>
          <p className="text-xs">
            Letters only, no spaces or hyphens, singular. Pull-ups is{' '}
            <span className="font-game text-white">PULLUP</span>, Farmer&apos;s carry is{' '}
            <span className="font-game text-white">FARMERS</span>. All {CATALOGUE.length} names are
            in the list icon at the top - you are not expected to know them by heart.
          </p>
        </section>

        <div className="flex flex-col gap-3 border-y border-white/10 py-5">
          <h3 className="label">
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
          <h3 className="label">
            2. Muscle feedback
          </h3>
          <p className="text-xs">
            The figure beside the board reacts to every guess. Guess SQUAT against a hidden
            DEADLIFT and the glutes light green while the quads go red - you have learned the
            answer is a posterior-chain movement without a single letter helping you.
          </p>
          <div className="panel-raised mt-1 rounded-xl p-3">
            <MuscleLegend detailed />
          </div>
          <p className="text-xs text-slate-500">
            Muscles the answer works are never lit until one of your guesses touches them. The
            figure narrows the search; it never hands you the answer.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="label">
            3. Hints unlock as you go
          </h3>
          <p className="text-xs">
            Guess {CATEGORY_HINT_AT} reveals the muscle group - as a chip under the board, and as
            a <strong className="text-yellow-300">dashed amber outline</strong> around that group
            on the figure. The outline says <em>where</em> the answer lives, not which muscles it
            works, so an outlined muscle can still be unlit.
          </p>
          <p className="text-xs">
            Guess {EQUIPMENT_HINT_AT} reveals the equipment: bodyweight, barbell, dumbbell,
            kettlebell or machine. The first two guesses are yours alone - that is where the
            deduction lives.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="label">4. After the daily</h3>
          <p className="text-xs">
            One puzzle a day, the same one for everybody, unlocking at midnight UTC. Solve it to
            extend your streak - miss a day and it resets.
          </p>
          <p className="text-xs">
            When you are done, <strong className="text-white">practice mode</strong> gives you
            unlimited random puzzles. Practice rounds are never recorded, so nothing you do there
            can help or hurt your streak.
          </p>
        </section>
      </div>
    </Modal>
  );
}
