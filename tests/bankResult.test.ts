/**
 * bankResult against a fake PostgREST, so the retries are exercised over real
 * HTTP rather than asserted from the source: the request shapes supabase-js
 * sends, and the error codes Postgres returns, are what decide these paths.
 *
 * Pins the three things the 2026-11-14 audit changed: a reset cannot re-open a
 * banked day (`banked_seed`), a taken name costs the name and never the round
 * (23505), and a project without the new column still banks.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

type Row = Record<string, unknown>;
const rows = new Map<string, Row>();
const posts: Row[] = [];
let missingBanked = false;
const names = () => new Set([...rows.values()].map((r) => String(r.username ?? '').toLowerCase()).filter(Boolean));

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const url = new URL(req.url!, 'http://x');
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET') {
      const sel = url.searchParams.get('select') ?? '';
      if (missingBanked && sel.includes('banked_seed')) {
        res.writeHead(400).end(JSON.stringify({ code: '42703', message: 'column fitdle_progress.banked_seed does not exist' }));
        return;
      }
      const id = (url.searchParams.get('user_id') ?? '').replace('eq.', '');
      const r = rows.get(id);
      const out = r ? [Object.fromEntries(sel.split(',').map((k) => [k.trim(), r[k.trim()] ?? null]))] : [];
      res.writeHead(200).end(JSON.stringify(out));
      return;
    }
    const body = JSON.parse(raw) as Row;
    posts.push(body);
    if (missingBanked && 'banked_seed' in body) {
      res.writeHead(400).end(JSON.stringify({ code: 'PGRST204', message: "Could not find the 'banked_seed' column" }));
      return;
    }
    const id = String(body.user_id);
    const n = body.username ? String(body.username).toLowerCase() : null;
    if (n && names().has(n) && String(rows.get(id)?.username ?? '').toLowerCase() !== n) {
      res.writeHead(409).end(JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint "fitdle_username_unique"' }));
      return;
    }
    rows.set(id, { ...(rows.get(id) ?? {}), ...body });
    res.writeHead(201).end('');
  });
});

await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const { port } = server.address() as { port: number };
process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
const { bankResult } = await import('@/server/progress');
const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';

test('banks, then refuses the same seed after a reset', async () => {
  const first = await bankResult(A, 20261114, false, ['SQUAT'], 6, 'Alex');
  assert.equal(first?.written, true);
  assert.equal(rows.get(A)?.banked_seed, 20261114);
  rows.get(A)!.save = {}; // fitdle_reset_progress
  const again = await bankResult(A, 20261114, true, ['PLANK'], 6, 'Alex');
  assert.equal(again?.written, false, 'a reset re-opened the day');
  assert.deepEqual(rows.get(A)?.save, {}, 'the reset row was overwritten');
});

test('a taken name is dropped, the round still banks', async () => {
  const r = await bankResult(B, 20261114, true, ['PLANK'], 2, 'alex');
  assert.equal(r?.written, true);
  assert.equal(rows.get(B)?.username, undefined, 'B took A’s name');
  assert.equal((rows.get(B)?.save as Row).streak, 1);
});

test('the name is cleaned before it is stored', async () => {
  const C = '00000000-0000-0000-0000-00000000000c';
  await bankResult(C, 20261114, true, ['PLANK'], 2, 'Zed‮evil');
  assert.equal(rows.get(C)?.username, 'Zedevil');
});

test('an un-migrated project without banked_seed still banks', async () => {
  missingBanked = true;
  const D = '00000000-0000-0000-0000-00000000000d';
  const r = await bankResult(D, 20261114, true, ['PLANK'], 3, 'Dee');
  assert.equal(r?.written, true);
  assert.equal(rows.get(D)?.banked_seed, undefined);
  missingBanked = false;
  server.close();
});
