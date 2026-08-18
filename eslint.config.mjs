import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

/*
 * Flat config, imported directly.
 *
 * This used to go through `FlatCompat`, which was needed while
 * eslint-config-next only shipped eslintrc-style configs. Next 16 exports flat
 * configs natively, and running them through the compat layer now throws
 * ("Converting circular structure to JSON") - the bridge is not just redundant,
 * it breaks.
 */
const config = [
  {
    ignores: ['.next/**', 'out/**', 'build/**', 'extension-dist/**', 'next-env.d.ts'],
  },
  ...coreWebVitals,
  ...typescript,
];

export default config;
