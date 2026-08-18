'use client';

/**
 * The Fitdle mark.
 *
 * Drawn as a CSS mask rather than an <img>, which is what lets one file work in
 * every theme. The source logo is a near-black silhouette: correct on the light
 * theme, invisible on the four dark ones. Masking throws the source colour away
 * and keeps only the shape, so the fill comes from `currentColor` and follows
 * whatever the surrounding text is doing - including in colourblind mode, and
 * including in any theme added later.
 *
 * `scripts/build-logo.mjs` emits the asset with the shape in its alpha channel
 * for exactly this reason. The generated files are committed, and a test
 * asserts they are present - a mask with a missing image renders as an empty
 * box rather than a broken image, so nothing at runtime would report it.
 */
export function Mark({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={className}
      style={{
        backgroundColor: 'currentColor',
        maskImage: 'url(/mark.png)',
        WebkitMaskImage: 'url(/mark.png)',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
      }}
    />
  );
}
