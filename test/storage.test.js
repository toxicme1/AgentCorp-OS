import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../src/storage.js';
import { defaultAgents, defaultEffects, defaultProviders } from '../src/config.js';

test('initializes all local JSON stores with safe defaults', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'adforge-data-'));
  try {
    const store = new JsonStore(directory);
    await store.init();
    assert.equal((await store.read('agents.json')).length, 11);
    assert.equal((await store.read('effects.json')).length, 100);
    assert.equal((await store.read('providers.json')).length, 5);
    assert.equal((await store.read('products.json')).length, 0);
    assert.equal(defaultAgents().some((agent) => !agent.systemPrompt), false);
    assert.deepEqual(defaultProviders().map((provider) => provider.id), ['openrouter', 'omniroute', 'gemini', 'groq', 'ollama']);
    assert.equal(defaultEffects().some((effect) => !effect.name), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('serializes concurrent appends without losing records', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'adforge-data-'));
  try {
    const store = new JsonStore(directory);
    await store.init();
    await Promise.all(Array.from({ length: 60 }, (_, index) => store.append('messages.json', { index })));
    const messages = await store.read('messages.json');
    assert.equal(messages.length, 60);
    assert.deepEqual(new Set(messages.map((message) => message.index)).size, 60);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
