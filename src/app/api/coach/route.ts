import { NextResponse } from 'next/server';
import { answerFor, dailySeed, playGuesses } from '@/server/game';
import { openSession } from '@/server/session';
import { askCoach } from '@/server/coach';
import { clientKey, rateLimit } from '@/server/rateLimit';
import { claimQuota } from '@/server/quota';
import { userIdFromRequest } from '@/server/supabase';

/**
 * Coaching questions about the day's exercise.
 *
 * Gated on having finished the round. The reveal is the only path to the
 * answer, and a coach that will describe the movement in detail is a reveal by
 * another name - so it is unlocked by the same signed session that unlocks
 * everything else, not by the client asking nicely.
 *
 * Tighter rate limit than the game routes: this one costs money per call.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const limit = rateLimit(`coach:${clientKey(request)}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many questions. Give it a minute.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  let question = '';
  let token: string | undefined;
  try {
    const body = (await request.json()) as { question?: unknown; state?: unknown };
    if (typeof body.question === 'string') question = body.question;
    if (typeof body.state === 'string') token = body.state;
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  if (!question.trim()) {
    return NextResponse.json({ error: 'Ask a question first.' }, { status: 400 });
  }

  const seed = dailySeed();
  const session = openSession(token, seed);
  if (!session) {
    return NextResponse.json({ error: 'Finish today’s puzzle first.' }, { status: 403 });
  }

  const answer = answerFor(seed);
  const outcome = playGuesses(seed, session.guesses, answer, session.call);

  // playGuesses returns a non-null reveal only once the round is genuinely
  // over, so this single check enforces the gate.
  if (!outcome.reveal) {
    return NextResponse.json({ error: 'Finish today’s puzzle first.' }, { status: 403 });
  }

  const userId = await userIdFromRequest(request);
  const quota = await claimQuota(userId, clientKey(request));
  if (!quota.allowed) {
    return NextResponse.json(
      {
        status: 'quota',
        text: userId
          ? `You have used today's ${quota.limit} questions. They reset at midnight UTC.`
          : `You have used your ${quota.limit} free questions. Sign in for more.`,
        quota,
      },
      { status: 200 },
    );
  }

  const reply = await askCoach(question, outcome.reveal);

  return NextResponse.json({ ...reply, quota }, {
    status: reply.status === 'error' ? 502 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
