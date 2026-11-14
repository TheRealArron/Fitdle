import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { claimAiBudget } from '@/server/aiBudget';
import type { Reveal } from '@/server/game';

/**
 * The form coach.
 *
 * Scope is the whole design. It answers questions about ONE exercise - the one
 * you just solved - and nothing else. That is not a limitation to apologise
 * for: a fitness chatbot that will write you a training programme is giving
 * medical-adjacent advice to a stranger it cannot assess, and a daily word game
 * has no business doing that. Answering "my knees cave on squats" is useful and
 * bounded. "Design my week" is neither.
 *
 * The exercise's own coaching data is injected into the system prompt, so the
 * model is describing a movement the app has already committed to rather than
 * recalling one, and the home substitution comes from our data rather than
 * being invented.
 */

/*
 * Overridable, because the model is the single biggest lever on what this costs
 * you and the right choice depends on your budget rather than on the code.
 * See .env.example for the trade.
 */
const MODEL = process.env.FITDLE_COACH_MODEL?.trim() || 'claude-opus-5';

/** Hard ceiling on what a caller can spend per question. */
const MAX_QUESTION_CHARS = 400;

export type CoachStatus = 'ok' | 'unconfigured' | 'refused' | 'error';

export interface CoachReply {
  status: CoachStatus;
  text: string;
}

/*
 * The stable half of the prompt, first so it can cache.
 *
 * Caching is a PREFIX match, and this used to open with the exercise's own
 * details - which change daily. That put the volatile bytes at position zero,
 * so nothing after them could ever match and every request paid full price.
 * Instructions first, day's data last.
 */
const STABLE_INSTRUCTIONS = `You are a form coach inside Fitdle, a daily exercise guessing game. The player has just finished today's puzzle and is asking about the exercise they solved.

SCOPE
Answer questions about the exercise described below and nothing else: technique, common form errors, what it works, how it feels when done right, equipment substitutions, and how to scale it easier or harder. The details below are authoritative - if the player describes the movement differently, go with the description below.

If asked for anything outside that - a training programme, a weekly split, diet or supplements, another exercise, or anything unrelated - say in one sentence that you only cover the day's movement, and offer what you can about the exercise below.

SAFETY
You are not a clinician and you cannot see the player. If they describe pain (not muscle burn, but joint pain, sharp pain, numbness, or an existing injury), say plainly that you cannot assess it and that a physio or doctor should, then stop. Do not suggest a workaround, a modification, or a way to train through it. Never diagnose.

STYLE
Two to four sentences. Plain, specific, and practical - the kind of correction a good coach gives on the gym floor, not a paragraph of caveats. Give the cue that fixes the problem rather than a list of everything that could be wrong. No markdown headers, no bullet lists, no emoji. Address the player as "you".`;

/** The volatile half: today's exercise. Must come AFTER the cached prefix. */
function exerciseBrief(target: Reveal): string {
  const home = target.homeVersion
    ? `\nNo-equipment substitute (use this if they lack the kit):\n  ${target.homeVersion.name} - ${target.homeVersion.howTo}`
    : '\nThis is a bodyweight movement; it needs no substitute.';

  return `THE EXERCISE
  Name: ${target.display}
  Muscle group: ${target.group}
  Equipment: ${target.equipment}
  Difficulty: ${target.difficulty}
  Primary muscles: ${target.primary.join(', ') || 'n/a'}
  Secondary muscles: ${target.secondary.join(', ') || 'n/a'}
  Today's prescription: ${target.challenge}

  How to perform it:
${target.howTo.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}${home}
`;
}

/**
 * Answers one question about the day's exercise.
 *
 * Never throws - a coaching feature failing must not take down the result
 * screen it lives on. Every failure path returns a status the UI can render.
 */
export async function askCoach(question: string, target: Reveal): Promise<CoachReply> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      status: 'unconfigured',
      text: 'The coach is not set up on this deployment.',
    };
  }

  const trimmed = question.trim().slice(0, MAX_QUESTION_CHARS);
  if (!trimmed) return { status: 'error', text: 'Ask a question first.' };

  /*
   * Claimed BEFORE the request, not after - a check that runs afterwards has
   * already spent the money it exists to prevent.
   */
  if (!(await claimAiBudget('coach')).allowed) {
    return {
      status: 'error',
      text: 'The coach has hit its daily limit. It will be back tomorrow.',
    };
  }

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      // Low effort deliberately: this is a short, bounded answer about a
      // movement whose details are already in the prompt. Deep reasoning buys
      // nothing here and costs the player latency on a result screen.
      output_config: { effort: 'low' },
      /*
       * Two blocks: the cached instructions, then the day's exercise. The
       * breakpoint sits on the first block, so the ~350-token instruction
       * prefix is shared by every request for every exercise, all day.
       */
      system: [
        { type: 'text' as const, text: STABLE_INSTRUCTIONS, cache_control: { type: 'ephemeral' as const } },
        { type: 'text' as const, text: exerciseBrief(target) },
      ],
      messages: [{ role: 'user', content: trimmed }],
    });

    /*
     * Check stop_reason before touching content. On a refusal the content array
     * can be empty, and indexing into it would throw inside a route handler.
     */
    if (response.stop_reason === 'refusal') {
      return {
        status: 'refused',
        text: 'I cannot answer that one. Ask me about the movement itself and I will help.',
      };
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    if (!text) return { status: 'error', text: 'No answer came back. Try rephrasing.' };
    return { status: 'ok', text };
  } catch (err) {
    // Distinguish "you are asking too fast" from everything else; the rest is
    // not the player's problem and should not be spelled out to them.
    if (err instanceof Anthropic.RateLimitError) {
      return { status: 'error', text: 'The coach is busy. Give it a moment.' };
    }
    console.error('[coach]', err);
    return { status: 'error', text: 'The coach is unavailable right now.' };
  }
}
