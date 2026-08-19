import { NextResponse } from 'next/server';
import { answerFor, dailySeed, playGuesses, validateGuess } from '@/server/game';
import { openSession, sealSession } from '@/server/session';
import { clientKey, rateLimit } from '@/server/rateLimit';
import { bankResult } from '@/server/progress';
import { verifiedUser } from '@/server/supabase';

/**
 * Submits one guess.
 *
 * The client sends its signed state plus the new word. The server re-derives
 * the entire game from scratch and returns the truth. There is no code path
 * that accepts a result from the client - `status` is computed here, from
 * guesses in a token this server signed.
 *
 * Rate limited to 20/minute: six guesses is a complete game, so anything past
 * that is a script.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const limit = await rateLimit(`guess:${clientKey(request)}`, 20, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Slow down - too many guesses.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  let guess = '';
  let token: string | undefined;
  try {
    const body = (await request.json()) as { guess?: unknown; state?: unknown };
    if (typeof body.guess === 'string') guess = body.guess.trim().toUpperCase();
    if (typeof body.state === 'string') token = body.state;
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  if (!/^[A-Z]{4,10}$/.test(guess)) {
    return NextResponse.json(
      { ok: false, reason: 'unknown', message: 'Not an exercise in the list' },
      { status: 200 },
    );
  }

  const seed = dailySeed();
  const answer = answerFor(seed);
  const session = openSession(token, seed);
  const existing = session?.guesses ?? [];

  // Status of the game BEFORE this guess, so a finished board cannot be extended.
  const before = playGuesses(seed, existing, answer, session?.call);

  const rejection = validateGuess(guess, existing, answer.name.length, before.status);
  if (rejection) {
    return NextResponse.json(
      { ...rejection, state: sealSession({ seed, guesses: existing, call: session?.call }) },
      { status: 200 },
    );
  }

  const guesses = [...existing, guess];
  const outcome = playGuesses(seed, guesses, answer, session?.call);

  /*
   * Bank the streak here, on the server, at the moment the round ends.
   *
   * This is the only place that knows - from a session it signed itself - both
   * that the round is over and how many guesses it took. The browser used to
   * decide this and upload the answer, which made `streak: 9999` a devtools
   * one-liner.
   *
   * Signed-in players only, and best effort: an anonymous player, an
   * unconfigured deployment, or a failed write all fall back to the local save.
   * A cloud problem must not cost someone the result they just earned.
   */
  let progress: Awaited<ReturnType<typeof bankResult>> = null;
  if (outcome.status !== 'playing') {
    const user = await verifiedUser(request);
    if (user) {
      progress = await bankResult(
        user.id,
        seed,
        outcome.status === 'won',
        guesses.length,
        user.username,
      );
    }
  }

  return NextResponse.json(
    {
      seed,
      serverTime: new Date().toISOString(),
      ...outcome,
      progress: progress?.save ?? null,
      state: sealSession({ seed, guesses, call: session?.call }),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
