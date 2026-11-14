import { NextResponse } from 'next/server';
import { answerFor, dailySeed, guessesSpent, playGuesses, validateGuess } from '@/server/game';
import { openSession, sealSession } from '@/server/session';
import { clientKey, rateLimit } from '@/server/rateLimit';
import { bankResult } from '@/server/progress';
import { verifiedUser } from '@/server/supabase';
import { MAX_GUESSES } from '@/data/exercises';
import { count, secondsUntilUtcMidnight } from '@/server/counter';

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

  /*
   * Resolved once, up front, because the guess counter below needs it on every
   * guess rather than only on the last one. `verifiedUser` returns immediately
   * without a network call when there is no Authorization header, so a
   * signed-out player - the common case - pays nothing for this. A signed-in
   * player pays one token verification per guess instead of one per round;
   * that is the price of a leaderboard number that cannot be reset.
   */
  const user = await verifiedUser(request);
  const existing = session?.guesses ?? [];

  /*
   * What the day has already cost, which is not always what this token admits.
   * Read BEFORE the guess is counted, so it is the state the guess arrives
   * into - and so a sixth guess spread across two sessions is refused the same
   * way a sixth guess in one session is.
   */
  const spentBefore = await guessesSpent(user?.id ?? null, seed);

  // Status of the game BEFORE this guess, so a finished board cannot be extended.
  const before = playGuesses(seed, existing, answer, session?.call, spentBefore);

  const rejection = validateGuess(guess, existing, answer.name.length, before.status);
  if (rejection) {
    return NextResponse.json(
      { ...rejection, state: sealSession({ seed, guesses: existing, call: session?.call }) },
      { status: 200 },
    );
  }

  const guesses = [...existing, guess];
  const outcome = playGuesses(seed, guesses, answer, session?.call, spentBefore + 1);

  /*
   * How many guesses this puzzle has really cost them.
   *
   * The session is the only record of a round and the client chooses whether to
   * send it, so `POST /api/today` with no token hands out a fresh board for the
   * same day. Measured: burn five guesses, discard, win in one - and the round
   * banked as a one-guess win, which is the top of a board ranked by fewest
   * guesses.
   *
   * So the server counts too. The counter is per account, not per address:
   * everyone behind one NAT would otherwise inflate each other's score, and it
   * is only the leaderboard this protects - a signed-out player's save is their
   * own file and nothing reads it but them.
   *
   * It saturates at MAX_GUESSES because that is all a round can cost, and the
   * Redis path keeps incrementing past a limit where the in-process one stops.
   */
  let spent = guesses.length;
  if (user) {
    const seen = await count(
      `spent:${seed}:${user.id}`,
      MAX_GUESSES,
      seed,
      secondsUntilUtcMidnight(),
    );
    spent = Math.max(guesses.length, Math.min(seen.count, MAX_GUESSES));
  }

  const settled = user ? playGuesses(seed, guesses, answer, session?.call, spent) : outcome;

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
  if (settled.status !== 'playing' && user) {
    try {
      progress = await bankResult(
        user.id,
        seed,
        settled.status === 'won',
        guesses,
        spent,
        user.username,
      );
    } catch (err) {
      /*
       * "Fails soft" was an assertion, not a guarantee, and it was false.
       *
       * `bankResult` handles a failed WRITE and returns null. It did not handle
       * a throw, and one was reachable: a row seeded `{}` by the AI quota made
       * `reconcile` throw on a missing `distribution`, the exception escaped
       * this handler, and the player got a 500 on the guess that won them the
       * round. That specific cause is fixed in `readRow`; this is the boundary
       * that makes the promise true for the next one.
       *
       * The result itself is already computed and is returned regardless. The
       * streak reconciles on their next completed round.
       */
      console.error('[guess] banking failed, returning the result anyway:', err);
    }
  }

  return NextResponse.json(
    {
      seed,
      serverTime: new Date().toISOString(),
      ...settled,
      progress: progress?.save ?? null,
      state: sealSession({ seed, guesses, call: session?.call }),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
