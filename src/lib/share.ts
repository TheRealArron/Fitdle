import { MAX_GUESSES } from '@/data/exercises';
import { getPuzzleNumber } from '@/lib/daily';
import { evaluationToEmoji, type LetterState } from '@/lib/evaluate';

export function buildShareText(
  seed: number,
  evaluations: LetterState[][],
  won: boolean,
  streak: number,
  colourblind = false,
): string {
  const score = won ? `${evaluations.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const grid = evaluations.map((e) => evaluationToEmoji(e, colourblind)).join('\n');
  const streakLine = streak > 1 ? `\n🔥 ${streak} day streak` : '';
  return `Fitdle #${getPuzzleNumber(seed)} ${score}\n\n${grid}${streakLine}`;
}

export type ShareOutcome = 'shared' | 'copied' | 'failed';

/**
 * Web Share where available (mobile, and it is a no-op in an extension popup),
 * clipboard otherwise, with a hidden-textarea fallback for the popup context
 * where the async clipboard API needs a permission the manifest does not grant.
 */
export async function shareResult(text: string): Promise<ShareOutcome> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (err) {
      // User dismissed the sheet — do not fall through to a surprise copy.
      if (err instanceof DOMException && err.name === 'AbortError') return 'failed';
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return legacyCopy(text) ? 'copied' : 'failed';
  }
}

function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(area);
  }
}
