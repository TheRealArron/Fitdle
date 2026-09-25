import { NextResponse } from 'next/server';
import { answerFor, dailySeed, guessesSpent, playGuesses } from '@/server/game';
import { openSession, sealSession } from '@/server/session';
import { clientKey, rateLimit } from '@/server/rateLimit';
import { verifiedUser } from '@/server/supabase';

/**
 * Opens (or resumes) today's puzzle.
 *
 * Returns everything the client needs to render a board - width, hint state,
 * muscle feedback for guesses already made - and never the answer, unless the
 * round is already over.
 *
 * The server clock is the only clock. A client with a wound-forward system time
 * gets today's puzzle regardless, because the seed is computed here.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const limit = await rateLimit(`today:${clientKey(request)}`, 60, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  let token: string | undefined;
  try {
    const body = (await request.json()) as { state?: unknown };
    if (typeof body.state === 'string') token = body.state;
  } catch {
    /* No body is fine - that is a fresh game. */
  }

  const seed = dailySeed();
  const answer = answerFor(seed);

  // A token from another day fails to open, which starts them cleanly on today.
  const session = openSession(token, seed);
  const guesses = session?.guesses ?? [];

  /*
   * A fresh board is not the same as an unspent day.
   *
   * Discarding the token used to hand back a clean six guesses for a puzzle
   * already half played, so a player about to lose could simply never submit
   * the sixth and their streak could never break. The server counts per
   * account, so the day ends when six have been spent however they were spread.
   */
  const user = await verifiedUser(request);
  const spent = await guessesSpent(user?.id ?? null, seed);

  const outcome = playGuesses(seed, guesses, answer, session?.call, spent);

  return NextResponse.json(
    {
      seed,
      serverTime: new Date().toISOString(),
      ...outcome,
      state: sealSession({ seed, guesses, call: session?.call }),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
