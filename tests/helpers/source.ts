/**
 * Read a source file with comments stripped.
 *
 * Assertions of the form "this file must NOT mention X" keep matching the
 * comment that explains why it must not mention X. That has now produced three
 * false failures in this repo - the bundle leak check, the guide's answer-data
 * check, and the quota's client-storage check - each time costing a debugging
 * round trip on code that was correct.
 *
 * So absence checks read the CODE, and presence checks can read the whole file.
 * Two functions, named so the choice is explicit at the call site.
 *
 * ── A correction, because that rule is not quite right ──────────────────────
 * "Presence checks can read the whole file" holds only when what you are
 * looking for is PROSE. A presence check for a code CONSTRUCT has exactly the
 * same problem as an absence check, in reverse: `assert.match(src, /finally/)`
 * passed in this repo with the `finally` block deleted, because the comment
 * explaining the block still said the word. If you are asserting that code
 * exists, read the code.
 */

import { readFileSync } from 'node:fs';

/** Whole file, comments included. For asserting something IS present. */
export function readSource(url: URL): string {
  return readFileSync(url, 'utf8');
}

/** Code only. For asserting something is ABSENT. */
export function readCode(url: URL): string {
  return readFileSync(url, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}
