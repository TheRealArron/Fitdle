import { NextResponse } from 'next/server';
import { GROUP_ORDER } from '@/data/muscles';
import { answerFor, dailySeed, playGuesses } from '@/server/game';
import { openSession, sealSession } from '@/server/session';
import { clientKey, rateLimit } from '@/server/rateLimit';

/**
 * Locks in the opening muscle-group call.
 *
 * Only accepted before the first guess and only once. Both rules are enforced
 * here rather than in the UI: a call placed after seeing a result, or revised
 * once it looked wrong, would be worth exactly as much as no call at all.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const limit = rateLimit(`call:${clientKey(request)}`, 20, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  let group = '';
  let token: string | undefined;
  try {
    const body = (await request.json()) as { group?: unknown; state?: unknown };
    if (typeof body.group === 'string') group = body.group;
    if (typeof body.state === 'string') token = body.state;
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  if (!GROUP_ORDER.includes(group as (typeof GROUP_ORDER)[number])) {
    return NextResponse.json({ error: 'Not a muscle group' }, { status: 400 });
  }

  const seed = dailySeed();
  const answer = answerFor(seed);
  const session = openSession(token, seed);
  const guesses = session?.guesses ?? [];

  if (guesses.length > 0) {
    return NextResponse.json(
      { error: 'The call has to come before your first guess.' },
      { status: 409 },
    );
  }
  if (session?.call !== undefined) {
    return NextResponse.json({ error: 'You have already called it.' }, { status: 409 });
  }

  const outcome = playGuesses(seed, guesses, answer, group);

  return NextResponse.json(
    {
      seed,
      serverTime: new Date().toISOString(),
      ...outcome,
      state: sealSession({ seed, guesses, call: group }),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
