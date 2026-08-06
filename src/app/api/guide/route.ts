import { NextResponse } from 'next/server';
import { askGuide } from '@/server/guide';
import { clientKey, rateLimit } from '@/server/rateLimit';
import { claimQuota } from '@/server/quota';
import { userIdFromRequest } from '@/server/supabase';

/**
 * The game guide.
 *
 * Deliberately NOT gated on a finished round - unlike the form coach, which is,
 * because the coach knows the day's exercise and this does not. The guide's
 * prompt contains no exercise names and no answer data, so there is nothing for
 * a mid-round player to extract. Gating it would only make it useless at the
 * moment a new player most needs it.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const limit = rateLimit(`guide:${clientKey(request)}`, 15, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many questions. Give it a minute.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  let question = '';
  try {
    const body = (await request.json()) as { question?: unknown };
    if (typeof body.question === 'string') question = body.question;
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  if (!question.trim()) {
    return NextResponse.json({ error: 'Ask a question first.' }, { status: 400 });
  }

  /*
   * Quota before the model call. Signing in raises the allowance, which is the
   * whole free-tier mechanism - and it also means the counter is durable rather
   * than something a devtools user can reset.
   */
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

  const reply = await askGuide(question);
  return NextResponse.json({ ...reply, quota }, {
    status: reply.status === 'error' ? 502 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
