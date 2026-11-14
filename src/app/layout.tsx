import type { Metadata, Viewport } from 'next';
import { Geist_Mono, Inter } from 'next/font/google';
import './globals.css';

/*
 * Two families, each doing one job.
 *
 * Inter carries the interface: menus, prose, buttons. It is a UI typeface with
 * a tall x-height, so the 10–12px labels in the rails stay legible where a
 * monospace at that size turns to mush.
 *
 * Geist Mono carries anything the player reads as *data*: tiles, timers,
 * streaks, exercise names, backup codes. Fixed advance width means a ticking
 * countdown or a changing streak never reflows its neighbours.
 *
 * Both are self-hosted at build time, so the static export works offline and
 * the extension popup makes no external font request.
 */
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

/**
 * The absolute origin, needed for link previews.
 *
 * og:image must be an absolute URL - a relative one is silently ignored by
 * every scraper, so the card just does not appear and nothing anywhere reports
 * why. Vercel injects the deployment host, which covers previews; set
 * NEXT_PUBLIC_SITE_URL to the real domain in production so shared links point
 * at it rather than at a deployment-specific hostname.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

const TITLE = 'Fitdle - Daily Exercise Deduction Game';
const DESCRIPTION =
  'Guess the daily exercise in six tries using two clues: the letters, and the muscles it works.';

/*
 * The icons and the link-preview card are not listed here. Next picks up
 * icon.png, apple-icon.png and opengraph-image.png from this directory by file
 * convention and emits the tags itself - naming them again would produce
 * duplicates. All three come from `npm run logo`.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'Fitdle',
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: 'Fitdle',
    type: 'website',
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0e18',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          Stamps the saved theme on <html> before the first paint.

          The settings store does this too, but from a useEffect - after
          hydration - so a player on Daylight got a full dark-to-light flash on
          every load. Measured on /play: body was rgb(10, 14, 24) at commit and
          rgb(245, 247, 250) once hydrated. The landing page is a server
          component with no settings store at all, so it never got the
          attributes and stayed dark whatever the player had chosen.

          Plain and blocking on purpose: `async`/`defer` would let the paint
          happen first, which is the whole bug.
        */}
        {/*
          The rule disabled below exists to stop third-party scripts holding up
          the render. Blocking is the point here: this is a ~400-byte
          first-party file whose entire job is to finish before the browser
          paints. `next/script` cannot do it - every strategy it offers,
          beforeInteractive included, is documented as NOT blocking, and this
          has to beat the paint. A test asserts it stays blocking.
        */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme.js" />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
