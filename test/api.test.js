import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.js';
import { JsonStore } from '../src/storage.js';

test('product, CSV import, campaign, and approval API behavior', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'adforge-api-'));
  const store = new JsonStore(path.join(root, 'data'));
  await store.init();
  const { server } = createApp({ store, outputDirectory: path.join(root, 'output') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);

    response = await fetch(`${base}/adforge/product`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '  Desk   Lamp ', price: 25.5 }),
    });
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.equal(created.product.title, 'Desk Lamp');

    response = await fetch(`${base}/adforge/campaign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: created.product.id }),
    });
    assert.equal(response.status, 201);
    const campaign = (await response.json()).campaign;
    assert.equal(campaign.productId, created.product.id);

    response = await fetch(`${base}/adforge/products/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ csv: 'title,price,description\n"USB, C Cable",9.99,"A 2m cable"\n' }),
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).imported, 1);

    response = await fetch(`${base}/adforge/approval`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'publish', details: { campaignId: campaign.id } }),
    });
    assert.equal(response.status, 201);
    const approval = await response.json();
    response = await fetch(`${base}/adforge/approval/${approval.id}/approve`, { method: 'POST' });
    assert.equal((await response.json()).status, 'approved');

    response = await fetch(`${base}/adforge/product`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '', price: -1 }),
    });
    assert.equal(response.status, 400);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
