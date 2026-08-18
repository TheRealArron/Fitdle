import type { MetadataRoute } from 'next';

/**
 * The web manifest, which is what makes Fitdle installable.
 *
 * A daily game is exactly the kind of thing people want on a home screen: it is
 * a thirty-second visit at the same time each day, and a tap on an icon beats
 * finding a tab. Without this file a browser has no reason to offer that -
 * Chrome requires a manifest declaring a 192 and a 512 icon before it will show
 * an install prompt at all, and iOS falls back to a screenshot of the page.
 *
 * `standalone` drops the browser chrome so an installed copy reads as an app
 * rather than a bookmark, which also reclaims the address bar's height on a
 * phone - the board is tall and that space is worth having.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Fitdle - Daily Exercise Deduction Game',
    short_name: 'Fitdle',
    description:
      'Guess the daily exercise in six tries using two clues: the letters, and the muscles it works.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0e18',
    theme_color: '#0a0e18',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      /*
       * Listed separately rather than as a combined "any maskable" purpose.
       * A maskable icon gets cropped to the launcher's shape, so it needs wider
       * padding than one displayed as-is - the same file cannot be ideal for
       * both, and declaring one file as both means the padding is wrong
       * somewhere.
       */
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
