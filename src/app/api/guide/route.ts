import { NextResponse } from 'next/server';
import { askGuide } from '@/server/guide';
import { clientKey, rateLimit } from '@/server/rateLimit';

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

  const reply = await askGuide(question);
  return NextResponse.json(reply, {
    status: reply.status === 'error' ? 502 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
