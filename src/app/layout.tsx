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

export const metadata: Metadata = {
  title: 'Fitdle — Daily Exercise Deduction Game',
  description:
    'Guess the daily exercise in six tries using two clues: the letters, and the muscles it works.',
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
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
