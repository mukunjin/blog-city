import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHealthSnapshot, validateStatusPayload } from './sync-health.mjs';

const NOW = Math.floor(Date.parse('2026-11-21T00:00:00.000Z') / 1000);

function makeBlogs(count = 1000) {
  return Array.from({ length: count }, (_, i) => ({
    url: `https://blog-${i}.example.com/`,
    feed: `https://blog-${i}.example.com/feed.xml`,
    dead: false,
    lastPost: { publishedAt: '2026-11-20T00:00:00.000Z' },
  }));
}

function previousFor(list) {
  return buildHealthSnapshot(list, {}, NOW).blogs;
}

test('accepts the documented API contract', () => {
  const blogs = makeBlogs();
  assert.equal(validateStatusPayload({ blogs }), blogs);
});

test('rejects missing and malformed API fields', async (t) => {
  const cases = [
    ['short payload', (b) => b.slice(0, 999), /only 999 blogs/],
    ['invalid URL', (b) => { b[0].url = 'not a URL'; return b; }, /url is invalid/],
    ['missing feed', (b) => { delete b[0].feed; return b; }, /feed is missing/],
    ['non-boolean dead', (b) => { b[0].dead = 'false'; return b; }, /dead is missing or not a boolean/],
    ['invalid post date', (b) => { b[0].lastPost.publishedAt = 'yesterday'; return b; }, /not a valid ISO date/],
    ['invalid failing date', (b) => { b[0].failingSince = {}; return b; }, /not a valid ISO date/],
  ];
  for (const [name, mutate, expected] of cases) {
    await t.test(name, () => {
      const blogs = mutate(makeBlogs());
      assert.throws(() => validateStatusPayload({ blogs }), expected);
    });
  }
  assert.throws(() => validateStatusPayload({}), /missing blogs array/);
});

test('keeps the last known post date for an isolated missing date', () => {
  const previous = previousFor(makeBlogs());
  const next = makeBlogs();
  delete next[0].lastPost;
  const result = buildHealthSnapshot(next, previous, NOW);
  assert.equal(result.blogs['blog-0.example.com'].lastPostAt, previous['blog-0.example.com'].lastPostAt);
});

test('rejects a sudden loss of tracked blogs', () => {
  const previous = previousFor(makeBlogs(1100));
  assert.throws(() => buildHealthSnapshot(makeBlogs(1000), previous, NOW), /tracked blogs fell/);
});

test('rejects a sudden loss of API-reported dates even when old dates are retained', () => {
  const previous = previousFor(makeBlogs());
  const next = makeBlogs();
  for (let i = 0; i < 100; i++) delete next[i].lastPost;
  assert.throws(() => buildHealthSnapshot(next, previous, NOW), /API-reported dates fell/);
});

test('rejects abrupt dead-count increases and resurrections', async (t) => {
  await t.test('increase', () => {
    const previous = previousFor(makeBlogs());
    const next = makeBlogs();
    for (let i = 0; i < 60; i++) {
      next[i].dead = true;
      next[i].failingSince = '2026-11-21T00:00:00.000Z';
    }
    assert.throws(() => buildHealthSnapshot(next, previous, NOW), /dead blogs changed/);
  });

  await t.test('resurrection', () => {
    const before = makeBlogs();
    for (let i = 0; i < 60; i++) {
      before[i].dead = true;
      before[i].failingSince = '2026-11-20T00:00:00.000Z';
    }
    const previous = previousFor(before);
    assert.throws(() => buildHealthSnapshot(makeBlogs(), previous, NOW), /dead blogs changed/);
  });
});

test('allows ordinary daily changes', () => {
  const previous = previousFor(makeBlogs());
  const next = makeBlogs();
  for (let i = 0; i < 10; i++) {
    next[i].dead = true;
    next[i].failingSince = '2026-11-21T00:00:00.000Z';
    delete next[i + 10].lastPost;
  }
  const result = buildHealthSnapshot(next, previous, NOW);
  assert.equal(result.dead, 10);
  assert.equal(result.dated, 1000);
});
