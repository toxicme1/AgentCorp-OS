import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../src/storage.js';
import { generateCampaign, isCopyCompliant } from '../src/pipeline.js';

test('generates 50 distinct compliant ads per language and platform assets', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'adforge-campaign-'));
  const store = new JsonStore(path.join(root, 'data'));
  try {
    await store.init();
    const product = {
      id: 'product-test',
      title: 'Desk Lamp',
      price: 39.99,
      currency: 'USD',
      description: 'Touch dimming desk lamp',
      targetPlatforms: ['Instagram', 'TikTok'],
      languages: ['English'],
    };
    await store.append('products.json', product);
    await store.append('campaigns.json', { id: 'campaign-test', productId: product.id, status: 'draft' });
    const result = await generateCampaign(store, 'campaign-test', path.join(root, 'output'));
    const ads = await store.read('ads.json');
    const assets = await store.read('assets.json');
    assert.equal(result.adCount, 50);
    assert.equal(ads.length, 50);
    assert.equal(assets.length, 200);
    assert.equal(new Set(ads.map((ad) => `${ad.angle}:${ad.style}`)).size, 50);
    assert.equal(new Set(ads.map((ad) => ad.effects.join(','))).size, 50);
    assert.equal(ads.every((ad) => ad.status === 'approved' && ad.effects.length === 4), true);
    assert.equal(assets.some((asset) => asset.width === 1080 && asset.height === 1920), true);
    const svg = await readFile(path.join(root, 'output', 'campaign-test', product.id, 'images', `${ads[0].id}-square.svg`), 'utf8');
    assert.match(svg, /<svg/);
    assert.match(svg, /39\.99/);
    const archive = await readFile(result.archivePath);
    assert.equal(archive.readUInt32LE(0), 0x04034b50);
    assert.equal((await store.read('campaigns.json'))[0].status, 'completed');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('compliance rejects unsupported discount and stock claims', () => {
  const product = { id: 'p', title: 'Lamp', price: 40 };
  const baseAd = { headline: 'Lamp', callToAction: 'See details', effects: [] };
  assert.equal(isCopyCompliant({ ...baseAd, body: 'Save 30% off now' }, product).approved, false);
  assert.equal(isCopyCompliant({ ...baseAd, body: 'Only 2 left in stock' }, product).approved, false);
  assert.equal(isCopyCompliant({ ...baseAd, body: 'Take a closer look' }, product).approved, true);
});
