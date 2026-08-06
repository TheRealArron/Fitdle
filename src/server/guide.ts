import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { claimAiBudget } from '@/server/aiBudget';
import { CATEGORY_HINT_AT, EQUIPMENT_HINT_AT, MAX_GUESSES } from '@/data/exercises';

/**
 * The game guide.
 *
 * Answers "how does this work?" - rules, scoring, the muscle map, streaks, the
 * hint schedule. Available at any time, including mid-round, which is exactly
 * why it is built the way it is.
 *
 * ┌─ It is safe by construction, not by instruction ───────────────────────────┐
 * │ Any chatbot that KNOWS the exercise catalogue is an oracle. Ask it "which  │
 * │ six-letter exercise works hamstrings?" and it performs the same           │
 * │ intersection that made the muscle panel hand over DEADLIFT outright.      │
 * │                                                                          │
 * │ Telling a model not to do that is a request, and requests get             │
 * │ jailbroken. So this prompt contains NO exercise names, no muscle-to-      │
 * │ exercise mapping, and no answer data of any kind. It is the same          │
 * │ principle that moved ANSWER_ORDER server-side: remove the capability      │
 * │ rather than forbid the behaviour.                                        │
 * │                                                                          │
 * │ A test greps this file for every name in the answer pool. If one ever     │
 * │ appears, the build fails.                                                │
 * └───────────────────────────────────────────────────────────────────────────┘
 */

const MODEL = 'claude-opus-5';
const MAX_QUESTION_CHARS = 300;

export type GuideStatus = 'ok' | 'unconfigured' | 'refused' | 'error';

export interface GuideReply {
  status: GuideStatus;
  text: string;
}

/*
 * The rules, drawn from the constants that define them rather than retyped.
 * A prompt that hardcodes "guess 3" drifts the moment the schedule changes.
 */
const SYSTEM = `You are the in-game guide for Fitdle, a daily exercise word game. You explain how the game works. You are talking to someone who is probably playing right now.

THE GAME
Each day everyone gets the same hidden exercise name. You have ${MAX_GUESSES} guesses. Answers are 5 to 9 letters and the grid width changes daily, which is itself a clue. Names are letters only, no spaces or hyphens.

Guesses must be real exercises from the game's list. The full list is in the app behind the "Exercise list" item in the menu - tell people to look there rather than trying to recall it.

TWO FEEDBACK CHANNELS
1. Letters, scored like Wordle. Green means right letter in the right place, yellow means the letter is in the answer somewhere else, grey means it is not in the answer at all.
2. Muscles. An anatomy figure sits beside the board and reacts to every guess:
   - Green: your guess and the answer both work this muscle.
   - Dark red: your guess works it, the answer does not - ruled out.
   - Dark/unlit: no guess has touched it yet, so it tells you nothing.
   - A dashed amber ring marks the answer's muscle group from guess ${CATEGORY_HINT_AT}. It only appears on muscles you have not probed, so it always adds something new. An outlined muscle is not necessarily worked.

HINTS
Guesses 1 and ${CATEGORY_HINT_AT - 1} are yours alone. The muscle group unlocks at guess ${CATEGORY_HINT_AT}, the equipment at guess ${EQUIPMENT_HINT_AT}.

THE OPENING CALL
Before your first guess you may call the answer's muscle group. Right, and the equipment hint unlocks immediately. Wrong, and you forfeit the guess-${CATEGORY_HINT_AT} muscle group hint. Skipping it plays the ordinary game. It is optional and it is a genuine risk.

STREAKS AND STATS
A streak counts consecutive days solved and resets if you miss a day or lose. Winning is recorded by the server when the round ends, so it cannot be faked from the browser. Signing in syncs your streak across devices and puts you on the leaderboard, which ranks longest current streaks and, on a second tab, everyone who solved today by fewest guesses.

OTHER MODES
Practice mode gives unlimited random rounds. They never touch your streak.
The anatomy drill is a 30-second warm-up: name the muscle each exercise works by tapping the figure. It has its own personal best and earns a share badge. Getting better at it makes you better at reading the muscle map.
After the round you get a prescription to actually do, with a no-equipment substitute for anything needing a barbell or dumbbell, and a form coach you can ask about that specific movement.

SETTINGS
Five themes including a light one, colourblind mode (swaps green/yellow for blue/orange across the board, figure and share grid), and reduced motion.

WHAT YOU MUST NOT DO
You do not know today's answer and you have no access to the exercise list. If asked what today's answer is, for a hint, for any exercise that fits a pattern, or for exercises that work a particular muscle, say plainly that you only explain the rules and that working it out is the game. Do not guess, do not speculate, and do not name specific exercises even as examples - naming any exercise narrows the search for someone playing right now.

If asked about fitness, form, injuries or training advice, say that the form coach on the result screen covers the day's movement, and that anything involving pain is a question for a physio rather than a game.

STYLE
Two to four sentences. Plain and direct, like a person who knows the game explaining it at a table. No markdown headers, no bullet lists, no emoji. Address the player as "you".`;

/** Answers one question about how the game works. Never throws. */
export async function askGuide(question: string): Promise<GuideReply> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { status: 'unconfigured', text: 'The guide is not set up on this deployment.' };
  }

  const trimmed = question.trim().slice(0, MAX_QUESTION_CHARS);
  if (!trimmed) return { status: 'error', text: 'Ask a question first.' };

  /*
   * Claimed BEFORE the request, not after - a check that runs afterwards has
   * already spent the money it exists to prevent.
   */
  if (!claimAiBudget('guide').allowed) {
    return {
      status: 'error',
      text: 'The guide has hit its daily limit. It will be back tomorrow.',
    };
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      // The rules are already in the prompt; there is nothing to reason out.
      output_config: { effort: 'low' },
      /*
       * Cached. This prompt is byte-identical on every request and is ~875
       * tokens - comfortably over Opus 5's 512-token cache minimum - so it is
       * the single biggest lever on cost here. Cache reads bill at roughly a
       * tenth of the input rate, which takes the input side of a question from
       * the dominant cost to a rounding error.
       *
       * Nothing volatile may be appended after this block, or the prefix stops
       * matching and every request pays full price again while looking fine.
       */
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: trimmed }],
    });

    // stop_reason before content: content can be empty on a refusal.
    if (response.stop_reason === 'refusal') {
      return { status: 'refused', text: 'Ask me about how the game works and I will help.' };
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    if (!text) return { status: 'error', text: 'No answer came back. Try rephrasing.' };
    return { status: 'ok', text };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return { status: 'error', text: 'The guide is busy. Give it a moment.' };
    }
    console.error('[guide]', err);
    return { status: 'error', text: 'The guide is unavailable right now.' };
  }
}

/** Exported for the test that proves no exercise name is in the prompt. */
export const GUIDE_SYSTEM_PROMPT = SYSTEM;
