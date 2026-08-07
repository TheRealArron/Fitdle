import 'server-only';
import type { Board, BoardEntry } from '@/lib/contracts';
import { adminClient } from '@/server/supabase';

/**
 * Public boards.
 *
 * Everything here runs under the service-role key, which bypasses RLS - so the
 * shape of what leaves this module is the ONLY thing standing between a
 * leaderboard and a data leak. Two rules, enforced by `toEntry` being the sole
 * exit:
 *
 *   1. No user id, ever. Not the UUID, not the email, not a hash of either. A
 *      stable public identifier is a correlation key, and a leaderboard is
 *      exactly where someone would go to collect them.
 *   2. "Is this me?" is decided HERE, against the verified caller, and leaves
 *      as a boolean. The client never gets the ids needed to work it out.
 */

const TABLE = 'fitdle_progress';
const TOP_N = 10;

/** Fallback for players who never set a username. */
const ANONYMOUS = 'Anonymous';

/**
 * Usernames are arbitrary text a stranger chose, rendered to every other
 * player. Trimmed and length-capped here so the board cannot be used to inject
 * a wall of text or spoof another row's layout. React escapes the content
 * itself, so this is about shape, not script injection.
 */
function displayName(raw: unknown): string {
  if (typeof raw !== 'string') return ANONYMOUS;
  const clean = raw.replace(/\s+/g, ' ').trim().slice(0, 20);
  return clean || ANONYMOUS;
}

interface Row {
  user_id: string;
  username: string | null;
  streak: number | null;
  day_guesses: number | null;
}

function toEntry(row: Row, index: number, value: number, userId: string | null): BoardEntry {
  return {
    rank: index + 1,
    name: displayName(row.username),
    value,
    // Decided server-side. The comparison never leaves this function.
    isYou: userId !== null && row.user_id === userId,
  };
}

const EMPTY: Board = { top: [], you: null, total: 0 };

/**
 * Longest current streaks.
 *
 * Ties break on `updated_at` ascending, which favours whoever got there first -
 * the same rule the spec asked for, and the only one that does not reshuffle
 * arbitrarily between requests.
 */
export async function streakBoard(userId: string | null): Promise<Board> {
  const client = adminClient();
  if (!client) return EMPTY;

  const { data, error, count } = await client
    .from(TABLE)
    .select('user_id, username, streak', { count: 'exact' })
    .gt('streak', 0)
    .order('streak', { ascending: false })
    .order('updated_at', { ascending: true })
    .limit(TOP_N);

  if (error || !data) return EMPTY;

  const top = data.map((r, i) => toEntry(r as Row, i, (r as Row).streak ?? 0, userId));
  return { top, you: await standing(userId, top, 'streak'), total: count ?? top.length };
}

/**
 * Today's solvers, ranked by fewest guesses.
 *
 * NOT by how fast they solved it. Nothing records when a player started, and
 * anything that did would be resettable by discarding the session and asking
 * for a fresh one - so a "fastest" board would rank whoever understood that
 * best. Guess count is already measured, already unforgeable, and is the thing
 * the game is actually about.
 */
export async function dailyBoard(seed: number, userId: string | null): Promise<Board> {
  const client = adminClient();
  if (!client) return EMPTY;

  const { data, error, count } = await client
    .from(TABLE)
    .select('user_id, username, day_guesses', { count: 'exact' })
    .eq('day_seed', seed)
    .eq('day_won', true)
    .order('day_guesses', { ascending: true })
    .order('updated_at', { ascending: true })
    .limit(TOP_N);

  if (error || !data) return EMPTY;

  const top = data.map((r, i) => toEntry(r as Row, i, (r as Row).day_guesses ?? 0, userId));
  return { top, you: await standing(userId, top, 'day', seed), total: count ?? top.length };
}

/**
 * Where the caller sits when they missed the top N.
 *
 * Rank is computed as "how many players are strictly ahead of me, plus one",
 * which is one indexed count rather than a scan of the whole table.
 */
async function standing(
  userId: string | null,
  top: BoardEntry[],
  board: 'streak' | 'day',
  seed?: number,
): Promise<Board['you']> {
  if (!userId || top.some((e) => e.isYou)) return null;

  const client = adminClient();
  if (!client) return null;

  const { data: mine } = await client
    .from(TABLE)
    .select('username, streak, day_guesses, day_seed, day_won')
    .eq('user_id', userId)
    .maybeSingle();

  if (!mine) return null;

  if (board === 'streak') {
    const value = (mine.streak as number | null) ?? 0;
    if (value <= 0) return null;
    const { count } = await client
      .from(TABLE)
      .select('user_id', { count: 'exact', head: true })
      .gt('streak', value);
    return { rank: (count ?? 0) + 1, value, name: displayName(mine.username) };
  }

  const value = (mine.day_guesses as number | null) ?? 0;
  if (mine.day_seed !== seed || !mine.day_won || value <= 0) return null;
  const { count } = await client
    .from(TABLE)
    .select('user_id', { count: 'exact', head: true })
    .eq('day_seed', seed)
    .eq('day_won', true)
    .lt('day_guesses', value);
  return { rank: (count ?? 0) + 1, value, name: displayName(mine.username) };
}
