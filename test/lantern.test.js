'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { handle, loadKeys, LANTERN_VERSION } = require('../lib/lantern.js');
const { lantern: nextLantern } = require('../lib/next.js');
const { lantern: nodeLantern } = require('../lib/node.js');

const SECRET = 'a'.repeat(40);
const ENV = { LAMPARO_KEY_09887C4F: `k_09887c4f:${SECRET}`, PATH: '/usr/bin' };
const ROOT = path.join(__dirname, 'fixtures', 'app');
const NOW = 1_800_000_000;

function sign(secret, p, keyId, ts, nonce) {
  return crypto.createHmac('sha256', secret).update(['GET', p, keyId, String(ts), nonce].join('\n')).digest('hex');
}
function headersFor(over = {}) {
  const h = { 'x-lamparo-key-id': 'k_09887c4f', 'x-lamparo-timestamp': String(NOW), 'x-lamparo-nonce': 'abcdefgh12345678', ...over };
  if (!('x-lamparo-signature' in over)) h['x-lamparo-signature'] = sign(SECRET, '/lamparo', h['x-lamparo-key-id'], h['x-lamparo-timestamp'], h['x-lamparo-nonce']);
  return h;
}
function call(over = {}, extra = {}) {
  const headers = headersFor(over);
  return handle({ method: 'GET', path: '/lamparo', header: (n) => headers[n], env: ENV, root: ROOT, now: NOW, ...extra });
}

test('a signed request gets the facts, signed back with the same secret', () => {
  const r = call();
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal(r.headers['x-lamparo-signature'], crypto.createHmac('sha256', SECRET).update(r.body).digest('hex'));
  const payload = JSON.parse(r.body);
  assert.equal(payload.probe_version, LANTERN_VERSION);
  assert.equal(payload.key_id, 'k_09887c4f');
  assert.equal(payload.facts.runtime.name, 'node');
  assert.equal(payload.facts.runtime.version, process.versions.node);
  assert.deepEqual(payload.facts.packages, [
    { name: '@lamparo/demo', version: '1.2.4', declared: '^1.2.0' },
    { name: 'next', version: '15.0.3', declared: '15.0.3' },
    { name: 'react', version: null, declared: '^19.0.0' },
  ]);
  assert.deepEqual(payload.errors, []);
  assert.ok(!payload.facts.cms && !payload.facts.php, 'Rien de PHP : la plateforme nomme le cadre par les paquets.');
});

test('a name that is not a package name never becomes a path', () => {
  const names = JSON.parse(call().body).facts.packages.map((p) => p.name);
  assert.ok(!names.includes('../evil'));
});

test('dev dependencies are not read', () => {
  const names = JSON.parse(call().body).facts.packages.map((p) => p.name);
  assert.ok(!names.includes('eslint'));
});

test('unsigned, mis-signed, stale, foreign or non-GET requests get a bare 404', () => {
  const cases = [
    call({ 'x-lamparo-signature': 'deadbeef' }),
    call({ 'x-lamparo-signature': undefined }),
    call({ 'x-lamparo-key-id': 'k_unknown1' }),
    call({ 'x-lamparo-timestamp': String(NOW - 301) }),
    call({ 'x-lamparo-nonce': 'short' }),
    handle({ method: 'POST', path: '/lamparo', header: (n) => headersFor()[n], env: ENV, root: ROOT, now: NOW }),
    handle({ method: 'GET', path: '/lamparo', header: (n) => headersFor()[n], env: {}, root: ROOT, now: NOW }),
  ];
  for (const r of cases) {
    assert.equal(r.status, 404);
    assert.equal(r.body, '');
    assert.equal(r.headers['x-lamparo-signature'], undefined);
  }
});

test('the signature covers the path: the same headers on another path fail', () => {
  const headers = headersFor();
  const r = handle({ method: 'GET', path: '/other', header: (n) => headers[n], env: ENV, root: ROOT, now: NOW });
  assert.equal(r.status, 404);
});

test('keys come from the environment only, one per account, ten at most, malformed ones ignored', () => {
  const env = { LAMPARO_KEY: `k_plain:${SECRET}`, LAMPARO_KEY_A: `k_aaaa:${SECRET}`, LAMPARO_KEY_A2: `k_aaaa:${SECRET}`, LAMPARO_KEY_BAD: 'nope', OTHER: `k_xxxx:${SECRET}` };
  for (let i = 0; i < 12; i++) env[`LAMPARO_KEY_N${i}`] = `k_n${i}:${SECRET}`;
  const keys = loadKeys(env);
  assert.equal(keys.length, 10);
  assert.ok(keys.some((k) => k.id === 'k_plain') && keys.some((k) => k.id === 'k_aaaa'));
  assert.ok(!keys.some((k) => k.id === 'k_xxxx'));
});

test('a missing package.json is reported, not hidden', () => {
  const r = call({}, { root: path.join(__dirname, 'fixtures', 'empty') });
  const payload = JSON.parse(r.body);
  assert.deepEqual(payload.facts.packages, []);
  assert.deepEqual(payload.errors, [{ scope: 'packages', reason: 'package.json not found' }]);
});

test('the Next.js adapter answers a fetch Request with a Response', async () => {
  const GET = nextLantern({ root: ROOT });
  const headers = headersFor({ 'x-lamparo-timestamp': String(Math.floor(Date.now() / 1000)) });
  const saved = { ...process.env };
  Object.assign(process.env, ENV);
  try {
    const res = await GET(new Request('https://next-test.host/lamparo?x=1', { headers }));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).facts.runtime.name, 'node');
    const miss = await GET(new Request('https://next-test.host/lamparo'));
    assert.equal(miss.status, 404);
    assert.equal(await miss.text(), '');
  } finally {
    for (const k of Object.keys(ENV)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

test('the node adapter writes head and body on a raw response, honouring originalUrl', () => {
  const handler = nodeLantern({ root: ROOT });
  const headers = headersFor({ 'x-lamparo-timestamp': String(Math.floor(Date.now() / 1000)) });
  const saved = { ...process.env };
  Object.assign(process.env, ENV);
  try {
    let written = null;
    const res = { writeHead: (status, h) => { written = { status, h }; }, end: (body) => { written.body = body; } };
    handler({ method: 'GET', url: '/lamparo?x=1', originalUrl: '/lamparo?x=1', headers }, res);
    assert.equal(written.status, 200);
    assert.equal(JSON.parse(written.body).key_id, 'k_09887c4f');
    handler({ method: 'GET', url: '/lamparo', headers: {} }, res);
    assert.equal(written.status, 404);
  } finally {
    for (const k of Object.keys(ENV)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
