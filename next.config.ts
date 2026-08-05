import type { NextConfig } from 'next';

/**
 * `BUILD_TARGET=extension` switches on the static export used by
 * `npm run build:extension`. The default web build stays a normal Next build so
 * `next start` and server deploys keep working.
 */
const isExtension = process.env.BUILD_TARGET === 'extension';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Content-Security-Policy: why `script-src` allows inline, and what that costs
 * ─────────────────────────────────────────────────────────────────────────────
 * The strong version of a CSP uses a per-request nonce so no inline script runs
 * unless the server minted it. That was implemented and then removed, because
 * it does not work here and failing quietly would be worse than not having it:
 *
 *   - A nonce must be generated per request, which requires DYNAMIC rendering.
 *   - This page is statically prerendered — the HTML is built once, so there is
 *     no per-request moment in which to stamp a nonce.
 *   - `'strict-dynamic'` additionally causes browsers to IGNORE `'self'`, so
 *     with it present and no nonce on the chunks, every script is refused.
 *     Verified: the app rendered a blank page and 1/7 smoke checks passed.
 *
 * So `script-src` here is `'self' 'unsafe-inline'`, which is honest about being
 * the weak directive. To upgrade, add `export const dynamic = 'force-dynamic'`
 * to app/layout.tsx and restore the nonce middleware — the cost is server
 * rendering on every request instead of a cached static page.
 *
 * What the rest of the policy still buys, which is not nothing:
 *   - `connect-src` is pinned to self + the one Supabase project, so injected
 *     script cannot exfiltrate a session token to an attacker's domain.
 *   - `object-src 'none'` and `base-uri 'self'` close plugin and base-tag
 *     hijacking, both classic XSS escalation routes.
 *   - `frame-ancestors 'none'` stops clickjacking an authenticated session.
 *   - `img-src` and `font-src` are allowlisted rather than open.
 *
 * None of it applies to the static export: `headers()` needs a server, and the
 * extension is governed by the MV3 manifest, which is stricter than anything
 * expressible here.
 */
function contentSecurityPolicy(): string {
  /*
   * Next's dev server compiles with `eval` for HMR and source maps. Without
   * this, the dev bundle is refused, React never hydrates, and the page renders
   * a dead shell at opacity 0 — which is exactly what happened: the policy was
   * only ever verified against a production build.
   *
   * Production never gets it.
   */
  const dev = process.env.NODE_ENV === 'development';

  let supabase = '';
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      supabase = ` ${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin}`;
    }
  } catch {
    /* Malformed URL — omit rather than emit a broken directive. */
  }

  return [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: https://i.ytimg.com`,
    `font-src 'self' data:`,
    `connect-src 'self'${supabase}`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');
}

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
  // Stop the browser second-guessing a Content-Type. Turns a file that sniffs
  // as HTML back into the type it was actually served as.
  { key: 'X-Content-Type-Options', value: 'nosniff' },

  // The session lives in localStorage, so clickjacking an authenticated page is
  // a real risk. `frame-ancestors 'none'` in the CSP covers modern browsers;
  // this covers the rest.
  { key: 'X-Frame-Options', value: 'DENY' },

  // Never leak the full URL to third parties; send the origin at most.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

  // The game needs none of these. Denying them means a compromised script
  // cannot silently reach for them either.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=()',
  },

  // Two years, subdomains included. Only meaningful over HTTPS, which is where
  // this will be deployed.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },

  // Legacy, but harmless and still honoured by some corporate proxies.
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const nextConfig: NextConfig = {
  ...(isExtension
    ? {
        output: 'export' as const,
        // No optimisation server exists behind a static export.
        images: { unoptimized: true },
      }
    : {
        async headers() {
          return [{ source: '/:path*', headers: securityHeaders }];
        },
      }),
};

export default nextConfig;
