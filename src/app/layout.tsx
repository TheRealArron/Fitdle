import type { Metadata, Viewport } from 'next';
import { Geist_Mono } from 'next/font/google';
import './globals.css';

// Self-hosted at build time, so the static export works offline and inside the
// extension popup with no external font request.
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Fitdle — Daily Exercise Word Game',
  description: 'Guess the five-letter exercise in six tries. A new one every day at midnight UTC.',
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
