import test from 'node:test';
import assert from 'node:assert/strict';
import { localizedCopy } from '../src/localization.js';

test('localizes fixed copy while preserving product name and price', () => {
  const result = localizedCopy('Spanish', { title: 'Desk Lamp', price: 39.99, currency: 'USD' });
  assert.equal(result.copies.length, 10);
  assert.match(result.copies[1], /Desk Lamp/);
  assert.match(result.copies[1], /USD 39\.99/);
  assert.equal(result.callToAction, 'Ver detalles');
  assert.equal(result.rtl, false);
  assert.equal(localizedCopy('Arabic', { title: 'Lamp' }).rtl, true);
  assert.throws(() => localizedCopy('Klingon', { title: 'Lamp' }), /Offline localization is not available/);
});
