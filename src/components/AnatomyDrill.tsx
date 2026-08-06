'use client';

import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { Check, Timer, Trophy, X, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MUSCLE_LABEL, type MuscleRegion } from '@/data/muscles';
import { DRILL_SECONDS, badgeFor, makeRound, type DrillQuestion } from '@/lib/drill';
import { commitDrill, loadSave, writeSave } from '@/lib/secureStorage';
import { BodyFigure } from './BodyFigure';

/**
 * The 30-second anatomy blitz.
 *
 * You answer by TAPPING THE MUSCLE ON THE FIGURE, not by picking from a list.
 * That is the whole pedagogical difference: a multiple-choice question tests
 * whether you recognise a word, while pointing at a body tests whether you know
 * where the muscle is - which is what the puzzle's muscle map actually asks of
 * you. A labelled option list remains underneath for keyboard and screen-reader
 * users, who cannot point at an SVG.
 *
 * Framed as a warm-up, not brain training. It drills one specific, checkable
 * skill - which muscles an exercise works - and that is exactly the second
 * feedback channel the main game scores you on, so getting better at it makes
 * you measurably better at Fitdle. No claim beyond that is made anywhere in the
 * copy.
 *
 * Deliberately touches no puzzle state: no streak, no seed, no server call. The
 * worst outcome of any bug in here is a wrong personal best.
 */

type Phase = 'idle' | 'running' | 'over';

export function AnatomyDrill() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [round, setRound] = useState<DrillQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [remaining, setRemaining] = useState(DRILL_SECONDS);
  const [picked, setPicked] = useState<MuscleRegion | null>(null);
  /*
   * Imperative controls rather than a changing `key`.
   *
   * Keying the wrapper to re-trigger the shake remounted the whole SVG on every
   * wrong answer - the figure detached and rebuilt mid-interaction, which is
   * both wasteful and enough to make the next tap land on a stale element.
   * Controls replay the same animation on a stable node.
   */
  const shake = useAnimationControls();
  const deadline = useRef(0);

  useEffect(() => {
    setBest(loadSave().save.drillBest ?? 0);
  }, []);

  const finish = useCallback((finalScore: number) => {
    setPhase('over');
    const { save } = loadSave();
    const next = commitDrill(save, finalScore);
    writeSave(next);
    setBest(next.drillBest ?? 0);
  }, []);

  // Drive the countdown off a wall-clock deadline rather than counting ticks:
  // a background tab throttles timers, and a decrementing counter would hand
  // back extra seconds when the tab is restored.
  useEffect(() => {
    if (phase !== 'running') return;
    const id = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) setScore((s) => (finish(s), s));
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, finish]);

  function start() {
    setRound(makeRound(Date.now()));
    setIndex(0);
    setScore(0);
    setPicked(null);
    setRemaining(DRILL_SECONDS);
    deadline.current = Date.now() + DRILL_SECONDS * 1000;
    setPhase('running');
  }

  function answer(region: MuscleRegion) {
    if (picked) return;
    setPicked(region);
    const correct = region === round[index].answer;
    if (correct) setScore((s) => s + 1);
    else void shake.start({ x: [0, -7, 6, -4, 0], transition: { duration: 0.32, ease: 'easeOut' } });

    // Brief pause so the figure can show where the answer actually was - the
    // teaching happens here, not in the score.
    window.setTimeout(
      () => {
        setPicked(null);
        setIndex((i) => (i + 1 < round.length ? i + 1 : 0));
      },
      correct ? 320 : 800,
    );
  }

  if (phase === 'idle' || phase === 'over') {
    const badge = badgeFor(score);
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        {phase === 'over' ? (
          <>
            <p className="font-game text-5xl font-bold text-white">{score}</p>
            <p className="text-sm text-slate-400">
              correct in {DRILL_SECONDS} seconds
              {score > 0 && score >= best ? ' · new best' : ''}
            </p>
            {badge ? (
              <p className="flex items-center gap-2 rounded-full bg-state-correct/15 px-3 py-1.5 text-sm font-semibold text-state-correct ring-1 ring-inset ring-state-correct/30">
                <span aria-hidden>{badge.emoji}</span>
                {badge.label}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <Zap className="h-8 w-8 text-state-present" />
            <div>
              <h3 className="font-game text-lg font-bold text-white">Anatomy drill</h3>
              <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-slate-400">
                {DRILL_SECONDS} seconds. Name the muscle each exercise works. It is the same
                skill the muscle map scores you on, so it makes you better at the puzzle.
              </p>
            </div>
          </>
        )}

        {best > 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <Trophy className="h-3.5 w-3.5" />
            Best {best}
          </p>
        ) : null}

        <button
          type="button"
          onClick={start}
          className="rounded-xl bg-state-correct px-5 py-2.5 text-sm font-bold text-slate-950 transition-transform hover:scale-[1.03] active:scale-95"
        >
          {phase === 'over' ? 'Go again' : 'Start drill'}
        </button>
      </div>
    );
  }

  const q = round[index];
  const correct = picked === q.answer;
  const shared = new Set<MuscleRegion>(picked ? [q.answer] : []);
  const missed = new Set<MuscleRegion>(picked && !correct ? [picked] : []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p
          className={[
            'flex items-center gap-1.5 font-game text-sm font-bold tabular-nums',
            remaining <= 5 ? 'text-state-excluded' : 'text-slate-300',
          ].join(' ')}
        >
          <Timer className="h-4 w-4" />
          {remaining}s
        </p>
        <p className="font-game text-sm font-bold text-white tabular-nums">{score}</p>
      </div>

      {/* The answer surface. Shakes on a wrong tap, then shows where it was. */}
      <motion.div animate={shake} className="h-40">
        <BodyFigure
          shared={shared}
          missed={missed}
          category={new Set()}
          className="h-full w-full"
          // Interactive: this is how the question is answered.
          onSelectRegion={picked ? undefined : answer}
          selectHint="choose as your answer" 
        />
      </motion.div>

      <div aria-live="polite" className="text-center">
        <p className="text-[11px] tracking-wide text-slate-500 uppercase">
          {picked
            ? correct
              ? 'Correct'
              : `That is ${MUSCLE_LABEL[q.answer]}`
            : 'Tap the muscle it works'}
        </p>
        <p className="font-game text-lg font-bold text-white">{q.exercise.display}</p>
      </div>

      {/*
        * Same question, reachable without a pointer. Not a hint list - it is
        * the accessible equivalent of the figure above, and it carries the same
        * three candidates so the difficulty matches.
        */}
      <div className="flex flex-col gap-1.5" aria-label="Answer options">
        {q.options.map((r) => {
          const isAnswer = picked && r === q.answer;
          const isWrongPick = picked === r && !correct;
          return (
            <button
              key={r}
              type="button"
              disabled={!!picked}
              onClick={() => answer(r)}
              className={[
                'flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                isAnswer
                  ? 'bg-state-correct text-slate-950'
                  : isWrongPick
                    ? 'bg-state-excluded text-white'
                    : 'bg-white/[0.06] text-slate-200 hover:bg-white/[0.12] disabled:opacity-50',
              ].join(' ')}
            >
              {MUSCLE_LABEL[r]}
              <AnimatePresence>
                {isAnswer ? (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                    <Check className="h-4 w-4" />
                  </motion.span>
                ) : isWrongPick ? (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                    <X className="h-4 w-4" />
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </button>
          );
        })}
      </div>
    </div>
  );
}
