const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(relative, globals) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  new Function('exports', ...Object.keys(globals), code)(exports, ...Object.values(globals));
  return exports;
}

function learnerApi() {
  let learner = { invited: false, preferences: { voice: 'Browser', language: 'English' } };
  let reads = 0;
  const api = load('adaptive.ts', { fetch: async (url, init) => {
    if (url.endsWith('/me')) reads++;
    if (url.endsWith('/invite')) learner.invited = true;
    if (url.endsWith('/preferences')) learner.preferences = JSON.parse(init.body);
    return { ok: true, json: async () => structuredClone(learner) };
  } });
  return { api, reads: () => reads };
}

test('concurrent startup calls share one anonymous learner bootstrap', async () => {
  const { api, reads } = learnerApi();
  await Promise.all([api.me(), api.me(), api.request('/recordings')]);
  assert.equal(reads(), 1);
});

test('invitation is visible to the next page without a full reload', async () => {
  const { api, reads } = learnerApi();
  assert.equal((await api.me()).invited, false);
  await api.request('/invite', { code: 'synthetic' });
  assert.equal((await api.me()).invited, true);
  assert.equal(reads(), 2);
});

test('saved narration preferences survive client-side navigation', async () => {
  const { api } = learnerApi();
  await api.me();
  await api.request('/preferences', { voice: 'Matthew', language: 'English' });
  assert.equal((await api.me()).preferences.voice, 'Matthew');
});

test('failed bootstrap can be retried', async () => {
  let attempts = 0;
  const api = load('adaptive.ts', { fetch: async () => {
    if (++attempts === 1) throw new Error('Offline');
    return { ok: true, json: async () => ({ invited: true }) };
  } });
  await assert.rejects(api.me(), /Offline/);
  assert.equal((await api.me()).invited, true);
});

function readAlong() {
  const pending = new Map();
  let sequence = 0;
  const { createReadAlong } = load('read-along.ts', {
    setTimeout: callback => { pending.set(++sequence, callback); return sequence; },
    clearTimeout: id => pending.delete(id),
  });
  const highlights = [];
  const driver = createReadAlong('One two three.', word => highlights.push(word.charIndex));
  function tick() {
    const next = pending.entries().next().value;
    if (!next) return;
    pending.delete(next[0]); next[1]();
  }
  return { driver, highlights, pending, tick };
}

test('real audio boundaries stop estimates from moving the highlight ahead', () => {
  const { driver, highlights, pending, tick } = readAlong();
  driver.boundary({ name: 'word', charIndex: 0, charLength: 3 });
  tick();
  assert.equal(pending.size, 0);
  assert.deepEqual(highlights, [0, 0]);
  driver.boundary({ name: 'word', charIndex: 4, charLength: 3 });
  assert.deepEqual(highlights, [0, 0, 4]);
});

test('estimated completion still accepts later speech boundaries', () => {
  const { driver, highlights, pending, tick } = readAlong();
  tick(); tick();
  assert.equal(pending.size, 0);
  driver.boundary({ name: 'word', charIndex: 4, charLength: 3 });
  assert.deepEqual(highlights, [0, 4, 8, 4]);
});

test('stopping narration clears estimates and ignores late boundaries', () => {
  const { driver, highlights, pending, tick } = readAlong();
  driver.stop();
  tick();
  driver.boundary({ name: 'word', charIndex: 4 });
  assert.equal(pending.size, 0);
  assert.deepEqual(highlights, [0]);
});
