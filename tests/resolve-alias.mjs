/**
 * Teaches Node's ESM resolver the `@/*` alias from tsconfig, and appends the
 * `.ts` extension that TypeScript lets source files omit. Lets the test runner
 * import the app's real modules with no build step.
 */
const SRC = new URL('../src/', import.meta.url);

/**
 * `next` ships no `exports` field, so Node's ESM resolver will not find the
 * extensionless `next/server` that every route handler imports - it resolves to
 * a directory entry that does not exist and suggests `next/server.js` in the
 * error. Bundlers apply CommonJS-style extension guessing and never see this.
 *
 * Without the rewrite no route handler can be imported by a test at all, which
 * is why until now every route was asserted against as a STRING. One line here
 * turns six route handlers into things a test can actually call.
 *
 * Kept to the one specifier that needs it rather than a general retry: a blanket
 * "try again with .js" would silently paper over a genuinely missing module.
 */
const NEXT_SUBPATHS = { 'next/server': 'next/server.js' };

export function resolve(specifier, context, next) {
  if (NEXT_SUBPATHS[specifier]) return next(NEXT_SUBPATHS[specifier], context);

  if (!specifier.startsWith('@/')) return next(specifier, context);

  const rest = specifier.slice(2);
  const target = /\.[a-z]+$/.test(rest)
    ? new URL(rest, SRC)
    : new URL(`${rest}.ts`, SRC);

  return next(target.href, context);
}
