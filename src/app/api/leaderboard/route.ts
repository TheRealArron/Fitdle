import { NextResponse } from 'next/server';
import { dailySeed } from '@/server/game';
import { dailyBoard, streakBoard } from '@/server/leaderboard';
import { clientKey, rateLimit } from '@/server/rateLimit';
import { userIdFromRequest } from '@/server/supabase';

/**
 * Public boards.
 *
 * Reads only. Nothing here can change a rank - the only way onto this board is
 * to finish a round, which /api/guess banks from a session it signed itself.
 *
 * Authentication is OPTIONAL: the board is public, and a signed-in caller gets
 * `isYou` flags and their own standing. An unverified token degrades to the
 * anonymous view rather than failing, because a stale JWT should not hide the
 * leaderboard.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const limit = await rateLimit(`board:${clientKey(request)}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  const url = new URL(request.url);
  const which = url.searchParams.get('board') === 'daily' ? 'daily' : 'streak';

  const userId = await userIdFromRequest(request);
  const seed = dailySeed();

  const board = which === 'daily' ? await dailyBoard(seed, userId) : await streakBoard(userId);

  return NextResponse.json(
    { board: which, seed, ...board },
    // Never cached: it changes as people finish, and a shared cache would serve
    // one player's `isYou` flags to everybody else.
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
