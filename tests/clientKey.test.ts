import assert from 'node:assert/strict';
import test from 'node:test';
import { clientKey } from '@/server/rateLimit';

/**
 * `clientKey` decides who every address-keyed limit belongs to. The attack it
 * must survive is a client writing its own `x-forwarded-for`: proxies append to
 * the right, so the left is attacker-controlled and the right is not.
 */

function req(headers: Record<string, string>) {
  return new Request('http://localhost/api/guess', { headers });
}

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test('a forged leftmost entry does not change the key behind one proxy', () => {
  withEnv({ VERCEL: undefined, FITDLE_TRUSTED_PROXY_HOPS: undefined }, () => {
    // nginx appended the real address 203.0.113.7 to whatever the client sent.
    const a = clientKey(req({ 'x-forwarded-for': '1.1.1.1, 203.0.113.7' }));
    const b = clientKey(req({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' }));
    assert.equal(a, '203.0.113.7');
    assert.equal(b, a, 'rotating the forged value must not buy a fresh key');
  });
});

test('a single entry is the client, so a plain proxy setup keys correctly', () => {
  withEnv({ VERCEL: undefined, FITDLE_TRUSTED_PROXY_HOPS: undefined }, () => {
    assert.equal(clientKey(req({ 'x-forwarded-for': '198.51.100.10' })), '198.51.100.10');
  });
});

test('two trusted hops reads the entry the outer proxy wrote', () => {
  withEnv({ VERCEL: undefined, FITDLE_TRUSTED_PROXY_HOPS: '2' }, () => {
    assert.equal(
      clientKey(req({ 'x-forwarded-for': 'forged, 203.0.113.7, 10.0.0.2' })),
      '203.0.113.7',
    );
  });
});

test('zero hops trusts no header at all', () => {
  withEnv({ VERCEL: undefined, FITDLE_TRUSTED_PROXY_HOPS: '0' }, () => {
    assert.equal(clientKey(req({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8' })), 'unknown');
  });
});

test('on Vercel the platform address wins over a forged forwarded-for', () => {
  withEnv({ VERCEL: '1', FITDLE_TRUSTED_PROXY_HOPS: undefined }, () => {
    assert.equal(
      clientKey(req({ 'x-forwarded-for': '1.1.1.1', 'x-real-ip': '203.0.113.9' })),
      '203.0.113.9',
    );
  });
});

test('the key is length-capped so a huge header cannot become a huge map key', () => {
  withEnv({ VERCEL: undefined, FITDLE_TRUSTED_PROXY_HOPS: undefined }, () => {
    assert.ok(clientKey(req({ 'x-forwarded-for': 'x'.repeat(5000) })).length <= 64);
  });
});
