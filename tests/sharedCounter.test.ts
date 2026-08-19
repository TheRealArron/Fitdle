import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { count } from '@/server/counter';
import { sharedCounterConfigured } from '@/server/sharedCounter';

/**
 * The shared counter, tested against a real HTTP server.
 *
 * Mocking `fetch` here would test that the code calls a function - it would not
 * catch a wrong URL path, a malformed body, a missing auth header, or a
 * response shape misread. So this stands up a server that speaks enough of the
 * Upstash REST protocol to answer, and points the client at it. Everything
 * below the network is genuinely exercised.
 */

/** Enough of Upstash to serve `/eval` of the increment script. */
function fakeUpstash(behaviour: 'ok' | 'error' | 'garbage' | 'hang' = 'ok') {
  const keys = new Map<string, number>();
  const seen: { auth: string | undefined; body: unknown }[] = [];

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      seen.push({ auth: req.headers.authorization, body: JSON.parse(raw || 'null') });

      if (behaviour === 'hang') return; // never responds: exercises the timeout
      if (behaviour === 'error') {
        res.writeHead(500).end('upstream is unwell');
        return;
      }
      if (behaviour === 'garbage') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ result: 'not-a-number' }));
        return;
      }

      // [script, numkeys, key, windowSeconds] - the script's own semantics.
      const [, , key] = JSON.parse(raw) as [string, number, string, string];
      const next = (keys.get(key) ?? 0) + 1;
      keys.set(key, next);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ result: next }));
    });
  });

  return new Promise<{ port: number; seen: typeof seen; close: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      resolve({
        port,
        seen,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}

function pointAt(port: number) {
  process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${port}`;
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
}

function unset() {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
}

test('with Redis configured, the count is shared and enforces the limit', async () => {
  const up = await fakeUpstash('ok');
  pointAt(up.port);
  try {
    const key = `k${Math.random()}`;
    const a = await count(key, 2, 1, 60);
    const b = await count(key, 2, 1, 60);
    const c = await count(key, 2, 1, 60);

    assert.equal(a.shared, true, 'should have gone to Redis');
    assert.deepEqual([a.allowed, b.allowed, c.allowed], [true, true, false]);
    assert.deepEqual([a.count, b.count, c.count], [1, 2, 3]);

    // The token must actually be sent, or a real deployment 401s.
    assert.equal(up.seen[0].auth, 'Bearer test-token');
  } finally {
    unset();
    await up.close();
  }
});

test('a new window is a new key, so counts do not leak across periods', async () => {
  const up = await fakeUpstash('ok');
  pointAt(up.port);
  try {
    const key = `w${Math.random()}`;
    await count(key, 1, 1, 60);
    const nextWindow = await count(key, 1, 2, 60);
    /*
     * The window id is part of the Redis key precisely so expiry and
     * correctness come from the same value. If it were not, this second call
     * would land in the first window's bucket and be refused.
     */
    assert.equal(nextWindow.allowed, true);
    assert.equal(nextWindow.count, 1);
  } finally {
    unset();
    await up.close();
  }
});

test('a Redis error falls back to the in-process counter, not to a refusal', async () => {
  const up = await fakeUpstash('error');
  pointAt(up.port);
  try {
    const r = await count(`e${Math.random()}`, 2, 1, 60);
    /*
     * Fail OPEN. An outage in the thing that limits abuse must not become an
     * outage of the game itself - and the request is still counted locally, so
     * the limit degrades to what it was before Redis existed rather than
     * vanishing.
     */
    assert.equal(r.allowed, true);
    assert.equal(r.shared, false, 'must be answered by memory');
    assert.equal(r.count, 1, 'the fallback still counts');
  } finally {
    unset();
    await up.close();
  }
});

test('a nonsense response is treated as no answer rather than as a count', async () => {
  const up = await fakeUpstash('garbage');
  pointAt(up.port);
  try {
    const r = await count(`g${Math.random()}`, 2, 1, 60);
    assert.equal(r.shared, false, 'a non-numeric result must not be trusted');
    assert.equal(r.allowed, true);
  } finally {
    unset();
    await up.close();
  }
});

test('a hung Redis times out and falls back rather than hanging the request', async () => {
  const up = await fakeUpstash('hang');
  pointAt(up.port);
  try {
    const started = Date.now();
    const r = await count(`h${Math.random()}`, 2, 1, 60);
    const took = Date.now() - started;

    assert.equal(r.shared, false);
    assert.equal(r.allowed, true);
    // The limiter's own latency must never become the outage it prevents.
    assert.ok(took < 3_000, `fell back after ${took}ms`);
  } finally {
    unset();
    await up.close();
  }
});

test('half-configured is treated as unconfigured', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://example.invalid';
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  try {
    /*
     * Missing one of the two variables is a deployment mistake. Attempting the
     * call would fail on every request; assuming it is configured would run
     * unlimited. Neither is as good as behaving exactly as if Redis were absent.
     */
    assert.equal(sharedCounterConfigured(), false);
    const r = await count(`p${Math.random()}`, 2, 1, 60);
    assert.equal(r.shared, false);
  } finally {
    unset();
  }
});

test('with nothing configured it is the in-process counter, unchanged', async () => {
  unset();
  assert.equal(sharedCounterConfigured(), false);
  const key = `n${Math.random()}`;
  assert.equal((await count(key, 1, 1, 60)).allowed, true);
  assert.equal((await count(key, 1, 1, 60)).allowed, false);
});
