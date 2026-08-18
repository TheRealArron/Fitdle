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
