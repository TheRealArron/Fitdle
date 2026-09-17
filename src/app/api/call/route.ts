import { NextResponse } from 'next/server';
import { GROUP_ORDER } from '@/data/muscles';
import { answerFor, dailySeed, playGuesses } from '@/server/game';
import { openSession, sealSession } from '@/server/session';
import { clientKey, rateLimit } from '@/server/rateLimit';
import { recordCall } from '@/server/callRecord';
import { userIdFromRequest } from '@/server/supabase';

/**
 * Locks in the opening muscle-group call.
 *
 * Only accepted before the first guess and only once. Both rules are enforced
 * here rather than in the UI: a call placed after seeing a result, or revised
 * once it looked wrong, would be worth exactly as much as no call at all.
 *
 * ── "Only once" needs a memory the caller does not hold ─────────────────────
 * This route used to enforce it from the session token alone, which meant it
 * did not enforce it at all: a request with no token was always a first call,
 * so seven of them - one per muscle group - found the right one and collected
 * the equipment hint with none of the forfeit. Averaged over the whole
 * schedule that took the candidate list from 19.8 to 2.7, and to exactly one
 * on 27 of the 62 days.
 *
 * So the call is recorded server-side, against the caller rather than against
 * the session. Calling the same group again replays your own outcome, which is
 * what a player who lost their token needs. Calling a different one is refused
 * and told which one stands, so a sweep learns nothing after its first request.
 * See `callRecord.ts` for what that does and does not close.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const limit = await rateLimit(`call:${clientKey(request)}`, 20, 60_000);
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

  /*
   * Signed-in players are keyed by their verified id, which is neither
   * shareable nor rotatable. Anonymous players fall back to an address, which
   * is - so this is a speed bump for them, exactly like the rate limiter, and
   * `callRecord.ts` says so rather than implying otherwise.
   */
  const userId = await userIdFromRequest(request);
  const owner = userId ? `u:${userId}` : `ip:${clientKey(request)}`;

  const standing = await recordCall(owner, seed, group);
  if (standing !== group) {
    // Deliberately carries no outcome for the group just asked about.
    return NextResponse.json(
      { error: `You already called ${standing} today.`, called: standing },
      { status: 409 },
    );
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
