import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateGuess, buildKeyStates, evaluationToEmoji } from '@/lib/evaluate';

const short = (guess: string, target: string) =>
  evaluateGuess(guess, target)
    .map((s) => ({ correct: 'C', present: 'P', absent: '.' })[s])
    .join('');

test('an exact match is all correct', () => {
  assert.equal(short('SQUAT', 'SQUAT'), 'CCCCC');
});

test('letters shared but misplaced are present, not absent', () => {
  // guess PLANK, answer LUNGE: L and N are both shared but displaced.
  assert.equal(short('PLANK', 'LUNGE'), '.P.P.');
  // guess BURPEE, answer SQUATS: only U is shared, at a different index.
  assert.equal(short('BURPEE', 'SQUATS'), '.P....');
});

test('positions are scored before presence', () => {
  // STEPUP vs PUSHUP: the trailing UP matches exactly and claims those letters
  // first, so the leading S and the third P can only come back present.
  assert.equal(short('STEPUP', 'PUSHUP'), 'P..PCC');
});

test('duplicate guess letters do not over-consume the target', () => {
  // PRESS has two S's, both consumed by exact matches at index 3 and 4.
  // The guess's other S's must come back absent.
  assert.deepEqual(evaluateGuess('SPSSS', 'PRESS'), [
    'absent',
    'present',
    'absent',
    'correct',
    'correct',
  ]);

  // Three E's guessed, the answer's single E already consumed by an exact match.
  assert.equal(short('EERIE', 'LUNGE'), '....C');
});

test('a duplicate in the correct slot wins over an earlier duplicate', () => {
  assert.equal(short('SPESS', 'PRESS'), '.PCCC');
});

test('guesses are case-insensitive', () => {
  assert.equal(short('squat', 'SQUAT'), 'CCCCC');
});

test('scoring is length-agnostic', () => {
  // The fixed 5-wide grid is gone; answers now run 5–9 letters.
  assert.equal(short('BEARCRAWL', 'BEARCRAWL'), 'CCCCCCCCC');
  assert.equal(short('DEADLIFT', 'DEADLIFT'), 'CCCCCCCC');
  assert.equal(evaluateGuess('CALFRAISE', 'BEARCRAWL').length, 9);
});

test('keyboard keys keep the best state a letter has earned', () => {
  // SPRINT displaces R and I; BRIDGE then nails them. The upgrade must stick.
  const guesses = ['SPRINT', 'BRIDGE'];
  const evaluations = guesses.map((g) => evaluateGuess(g, 'BRIDGE'));
  const keys = buildKeyStates(guesses, evaluations);

  assert.equal(keys['R'], 'correct', 'R was present in SPRINT, then correct in BRIDGE');
  assert.equal(keys['I'], 'correct');
  assert.equal(keys['S'], 'absent');
});

test('a state never downgrades on a later guess', () => {
  const guesses = ['BRIDGE', 'SPRINT'];
  const evaluations = guesses.map((g) => evaluateGuess(g, 'BRIDGE'));
  const keys = buildKeyStates(guesses, evaluations);
  assert.equal(keys['R'], 'correct', 'correct must survive a later present');
});

test('emoji share grid matches the evaluation', () => {
  assert.equal(evaluationToEmoji(evaluateGuess('SQUAT', 'SQUAT')), '🟩🟩🟩🟩🟩');
  assert.equal(evaluationToEmoji(evaluateGuess('STEPUP', 'PUSHUP')), '🟨⬛⬛🟨🟩🟩');
});
