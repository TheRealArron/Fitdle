import type { Metadata } from 'next';
import { Game } from '@/components/Game';

/**
 * The game.
 *
 * It lived at `/` until the landing page needed the root. Nothing links to the
 * old location - there were no users yet - but the browser extension's popup
 * does open a specific file out of the static export, so its manifest points
 * here rather than at index.html.
 */
export const metadata: Metadata = {
  title: "Play today's puzzle - Fitdle",
  // A marketing page belongs in search results; a game board does not.
  robots: { index: false, follow: true },
};

export default function Play() {
  return <Game />;
}
