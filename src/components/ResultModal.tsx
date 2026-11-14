'use client';

import { Dumbbell, Flame, Share2, Shuffle, Target, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { MuscleRegion } from '@/data/muscles';
import { MAX_GUESSES, musclesOf } from '@/data/exercises';
import { MUSCLE_LABEL, REGIONS_IN_GROUP, type MuscleGroup } from '@/data/muscles';
import { accumulateMuscleFeedback } from '@/lib/muscleFeedback';
import { buildShareText, shareResult } from '@/lib/share';
import { loadSave } from '@/lib/secureStorage';
import { useGameStore } from '@/store/useGameStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { BodyFigure } from './BodyFigure';
import { Countdown } from './Countdown';
import { DailyChallenge } from './DailyChallenge';
import { MuscleDetail } from './MuscleDetail';
import { FormCoach } from './FormCoach';
import { FormVideo } from './FormVideo';
import { Modal } from './Modal';

const GROUP_CLASS: Record<MuscleGroup, string> = {
  Core: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  Legs: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  Chest: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  Back: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  Shoulders: 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30',
  Arms: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
  Full: 'bg-orange-500/15 text-orange-300 ring-orange-500/30',
};

export function ResultModal() {
  const open = useGameStore((s) => s.modalOpen);
  const setModalOpen = useGameStore((s) => s.setModalOpen);
  const status = useGameStore((s) => s.status);
  const target = useGameStore((s) => s.reveal);
  const guesses = useGameStore((s) => s.guesses);
  const evaluations = useGameStore((s) => s.evaluations);
  const streak = useGameStore((s) => s.streak);
  const seed = useGameStore((s) => s.seed);
  const setToast = useGameStore((s) => s.setToast);
  const mode = useGameStore((s) => s.mode);
  const startPractice = useGameStore((s) => s.startPractice);
  const isPractice = mode === 'practice';

  const colourblind = useSettingsStore((s) => s.colourblind);
  // Read straight from storage: a drill best is not puzzle state and has no
  // business living in the game store.
  const drillSave = loadSave().save;
  const drillBest = drillSave.drillBest ?? 0;
  const drillFlawless = drillSave.drillFlawless ?? false;
  const [sharing, setSharing] = useState(false);
  const [region, setRegion] = useState<MuscleRegion | null>(null);
  const won = status === 'won';

  /*
   * `reveal` is null until the server discloses the answer, which it only does
   * once the round is over. This modal cannot render before then - and that is
   * the guarantee, not a formality: there is no client-side path to the answer.
   */
  const hasAnswer = target !== null;

  // On the result screen the full answer is public, so the figure switches
  // from "what you probed" to the complete muscle map - the teaching payoff.
  const answerMuscles = useMemo(
    () => (target ? musclesOf(target) : new Set<MuscleRegion>()),
    [target],
  );
  const probed = useMemo(
    () => (target ? accumulateMuscleFeedback(guesses, target).missed : new Set<MuscleRegion>()),
    [guesses, target],
  );
  const categoryRegions = useMemo(
    () => (target ? new Set(REGIONS_IN_GROUP[target.group]) : new Set<MuscleRegion>()),
    [target],
  );

  const onShare = async () => {
    // Belt and braces: the button is hidden in practice, but `seed` is still
    // the daily's, so a stray call would publish today's puzzle number against
    // a practice grid.
    if (isPractice) return;
    setSharing(true);
    const text = buildShareText(seed, evaluations, won, streak, colourblind, drillBest, drillFlawless);
    const outcome = await shareResult(text);
    setSharing(false);
    setToast(
      outcome === 'shared'
        ? 'Shared'
        : outcome === 'copied'
          ? 'Result copied to clipboard'
          : 'Could not share - copy manually',
    );
  };

  return (
    <Modal
      open={open && status !== 'playing' && hasAnswer}
      onClose={() => setModalOpen(false)}
      title={isPractice ? (won ? 'Practice: solved' : 'Practice: missed') : won ? 'Rep completed' : 'Set failed'}
    >
      {!target ? null : (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div
            className={[
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
              won ? 'bg-state-correct/20 text-state-correct' : 'bg-rose-500/15 text-rose-400',
            ].join(' ')}
          >
            {won ? <Trophy className="h-6 w-6" /> : <Target className="h-6 w-6" />}
          </div>
          <div className="min-w-0">
            <p className="font-game text-2xl font-bold tracking-widest text-white">
              {target.name}
            </p>
            <p className="truncate text-sm text-slate-400">{target.display}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={[
              'rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset',
              GROUP_CLASS[target.group],
            ].join(' ')}
          >
            {target.group}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300 ring-1 ring-inset ring-white/10">
            <Dumbbell className="h-3.5 w-3.5" />
            {target.equipment}
          </span>
          <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300 ring-1 ring-inset ring-white/10">
            {target.difficulty}
          </span>
          <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300 ring-1 ring-inset ring-white/10">
            {won ? `${guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`}
          </span>
          {!isPractice && streak > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-orange-500/15 px-3 py-1 text-xs font-semibold text-orange-300 ring-1 ring-inset ring-orange-500/30">
              <Flame className="h-3.5 w-3.5" />
              {streak}
            </span>
          )}
        </div>

        <section className="rounded-xl bg-black/25 p-3">
          <h3 className="label mb-1">
            What it actually works
          </h3>
          <BodyFigure
            shared={answerMuscles}
            missed={probed}
            category={categoryRegions}
            className="mx-auto h-44 w-auto"
            onSelectRegion={(r) => setRegion((cur) => (cur === r ? null : r))}
            selected={region}
          />
          {/* The modal only exists after the round, so the answer is public. */}
          <MuscleDetail
            region={region}
            answer={target}
            onClose={() => setRegion(null)}
          />
          <p className="mt-1 text-center text-xs leading-relaxed text-slate-400">
            <span className="font-semibold text-state-correct">
              {target.primary.map((m) => MUSCLE_LABEL[m]).join(', ')}
            </span>
            {target.secondary.length > 0 && (
              <> · assisted by {target.secondary.map((m) => MUSCLE_LABEL[m]).join(', ')}</>
            )}
          </p>
        </section>

        <DailyChallenge />

        {!won && (
          <p className="text-sm leading-relaxed text-slate-300">
            {isPractice ? 'The answer was ' : "Today's exercise was "}
            <strong className="text-white">{target.display}</strong>.
          </p>
        )}

        <section>
          <h3 className="label mb-2">
            How to do it
          </h3>
          <ol className="mb-3 flex flex-col gap-2">
            {target.howTo.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-slate-300">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/5 font-game text-xs font-bold text-slate-400">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          {/* Shown on wins too - the coaching is the point of the game, and
              hiding it behind a loss punishes the players who engaged most. */}
          <FormVideo answer={target} />
        </section>

        {/* Coaching sits after the how-to, not instead of it: the steps are the
            authoritative description, this is where you go when they are not
            enough or you have not got the kit. */}
        <section>
          <h3 className="label mb-2">Coach</h3>
          <FormCoach />
        </section>

        <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
          {isPractice ? (
            <>
              <p className="text-center text-xs text-slate-500">
                Practice rounds are not recorded and have no puzzle number, so there is nothing
                to share.
              </p>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  startPractice();
                }}
                className="btn btn-primary w-full"
              >
                <Shuffle className="h-4 w-4" />
                Another round
              </button>
            </>
          ) : (
            <>
              <Countdown />
              <button
                type="button"
                onClick={onShare}
                disabled={sharing}
                className="btn btn-primary w-full"
              >
                <Share2 className="h-4 w-4" />
                {sharing ? 'Sharing…' : 'Share result'}
              </button>
            </>
          )}
        </div>
      </div>
      )}
    </Modal>
  );
}
