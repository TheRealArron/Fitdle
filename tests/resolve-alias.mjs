/**
 * Teaches Node's ESM resolver the `@/*` alias from tsconfig, and appends the
 * `.ts` extension that TypeScript lets source files omit. Lets the test runner
 * import the app's real modules with no build step.
 */
const SRC = new URL('../src/', import.meta.url);

export function resolve(specifier, context, next) {
  if (!specifier.startsWith('@/')) return next(specifier, context);

  const rest = specifier.slice(2);
  const target = /\.[a-z]+$/.test(rest)
    ? new URL(rest, SRC)
    : new URL(`${rest}.ts`, SRC);

  return next(target.href, context);
}
