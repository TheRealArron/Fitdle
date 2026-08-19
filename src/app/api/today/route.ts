import { NextResponse } from 'next/server';
import { answerFor, dailySeed, playGuesses } from '@/server/game';
import { openSession, sealSession } from '@/server/session';
import { clientKey, rateLimit } from '@/server/rateLimit';

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

  const outcome = playGuesses(seed, guesses, answer, session?.call);

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
