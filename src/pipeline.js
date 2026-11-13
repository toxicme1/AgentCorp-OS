import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultEffects } from './config.js';
import { localizedCopy } from './localization.js';
import { makeZip } from './zip.js';

const angles = [
  ['value', 'Everyday value'],
  ['price', 'Price spotlight'],
  ['gift', 'Gift idea'],
  ['feature', 'Product detail'],
  ['simple', 'Simple choice'],
  ['seasonal', 'Seasonal pick'],
  ['style', 'Style spotlight'],
  ['discovery', 'Worth a look'],
  ['use-case', 'Made for your routine'],
  ['browse', 'Take a closer look'],
];

const styles = [
  { id: 'black-gold', name: 'Black and gold luxury', background: '#17120c', foreground: '#ffe2a3', accent: '#d3a64f' },
  { id: 'neon', name: 'Neon bold', background: '#0d1021', foreground: '#ffffff', accent: '#f72585' },
  { id: 'minimal', name: 'Clean white minimal', background: '#f7f7f2', foreground: '#20252b', accent: '#486581' },
  { id: 'festive', name: 'Festive gifting', background: '#fff3e8', foreground: '#541b2a', accent: '#bd3945' },
  { id: 'retail', name: 'Bright retail sale', background: '#fff8d8', foreground: '#252525', accent: '#ed5b25' },
];

const dataRestrictedEffectIds = new Set(['E050', 'E089', 'E090', 'E091', 'E095', 'E096']);
const effectPool = defaultEffects().filter((effect) => effect.tier === 'A' && !dataRestrictedEffectIds.has(effect.id));
const effectSets = [];
for (let a = 0; a < effectPool.length && effectSets.length < 50; a += 1) {
  for (let b = a + 1; b < effectPool.length && effectSets.length < 50; b += 1) {
    for (let c = b + 1; c < effectPool.length && effectSets.length < 50; c += 1) {
      for (let d = c + 1; d < effectPool.length && effectSets.length < 50; d += 1) {
        effectSets.push([effectPool[a], effectPool[b], effectPool[c], effectPool[d]]);
      }
    }
  }
}

const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function slug(value) {
  return String(value).normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'product';
}

function formatPrice(product) {
  const formatted = Number(product.price).toFixed(2);
  return product.currency ? `${product.currency} ${formatted}` : formatted;
}

function textLines(text, maxLength = 38) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function svgFor({ product, copy, callToAction, style, width, height, rtl }) {
  const titleLines = textLines(product.title, Math.max(20, Math.floor(width / 30)));
  const copyText = textLines(copy, Math.max(24, Math.floor(width / 24)));
  const scale = width / 1080;
  const titleStart = Math.round(height * 0.43);
  const title = titleLines.map((line, index) => `<text x="${Math.round(width * 0.08)}" y="${titleStart + index * 56 * scale}" font-size="${Math.round(42 * scale)}" font-weight="700">${safe(line)}</text>`).join('');
  const copyStart = titleStart + titleLines.length * 56 * scale + 24 * scale;
  const description = copyText.map((line, index) => `<text x="${Math.round(width * 0.08)}" y="${Math.round(copyStart + index * 34 * scale)}" font-size="${Math.round(24 * scale)}">${safe(line)}</text>`).join('');
  const price = product.price != null && product.price !== ''
    ? `<text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.82)}" font-size="${Math.round(32 * scale)}" font-weight="700">${safe(formatPrice(product))}</text>`
    : '';
  const direction = rtl ? ' direction="rtl"' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"${direction}><rect width="100%" height="100%" fill="${style.background}"/><rect x="0" y="0" width="${width}" height="${Math.round(height * 0.018)}" fill="${style.accent}"/><circle cx="${Math.round(width * 0.78)}" cy="${Math.round(height * 0.25)}" r="${Math.round(Math.min(width, height) * 0.18)}" fill="${style.accent}" opacity=".18"/><text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.13)}" fill="${style.foreground}" font-family="Arial,sans-serif" font-size="${Math.round(20 * scale)}" letter-spacing="2">${safe(style.name.toUpperCase())}</text><g fill="${style.foreground}" font-family="Arial,sans-serif">${title}${description}${price}</g><rect x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.88)}" width="${Math.round(width * 0.84)}" height="${Math.round(58 * scale)}" rx="${Math.round(12 * scale)}" fill="${style.accent}"/><text x="${Math.round(width * 0.5)}" y="${Math.round(height * 0.88 + 39 * scale)}" text-anchor="middle" fill="${style.foreground}" font-family="Arial,sans-serif" font-size="${Math.round(22 * scale)}" font-weight="700">${safe(callToAction.toUpperCase())}</text></svg>`;
}

function presetsFor(platform, presets) {
  const platformNames = [platform.toLowerCase()];
  const matching = presets.filter((preset) => (preset.platforms ?? []).some((name) => platformNames.includes(name.toLowerCase())));
  return matching.length ? matching : [presets.find((preset) => preset.id === 'square') ?? presets[0]];
}

export async function generateCampaign(store, campaignId, outputDirectory = process.env.OUTPUT_DIR || './output') {
  const campaign = (await store.read('campaigns.json')).find((item) => item.id === campaignId);
  if (!campaign) throw Object.assign(new Error('Campaign not found'), { statusCode: 404 });
  const product = (await store.read('products.json')).find((item) => item.id === campaign.productId);
  if (!product) throw Object.assign(new Error('Campaign product not found'), { statusCode: 404 });

  const settings = await store.read('settings.json');
  const languages = product.languages?.length ? product.languages : settings.defaultLanguages;
  const localizations = Object.fromEntries(languages.map((language) => [language, localizedCopy(language, product)]));
  const platforms = product.targetPlatforms?.length ? product.targetPlatforms : ['Instagram'];
  const productDir = path.resolve(outputDirectory, slug(campaignId), slug(product.id));
  const imagesDir = path.join(productDir, 'images');
  const copyDir = path.join(productDir, 'copy');
  const videoDir = path.join(productDir, 'videos');
  const gifsDir = path.join(productDir, 'gifs');
  const adRows = [];
  const assetRows = [];
  const createdAt = new Date().toISOString();
  const allPresets = settings.platformPresets ?? [];

  const claimed = await store.update('campaigns.json', (item) => item.id === campaignId && item.status === 'draft', (item) => ({ ...item, status: 'running', startedAt: new Date().toISOString() }));
  if (!claimed) throw Object.assign(new Error('Campaign is not in draft status'), { statusCode: 409 });

  try {
    await Promise.all([imagesDir, copyDir, videoDir, gifsDir].map((directory) => mkdir(directory, { recursive: true })));
    for (const language of languages) {
      for (let angleIndex = 0; angleIndex < angles.length; angleIndex += 1) {
        for (let styleIndex = 0; styleIndex < styles.length; styleIndex += 1) {
          const [angleId, angleName] = angles[angleIndex];
          const style = styles[styleIndex];
          const adId = crypto.randomUUID();
          const localized = localizations[language];
          const copy = localized.copies[angleIndex];
          const chosenEffects = effectSets[(angleIndex * styles.length + styleIndex) % effectSets.length];
          const ad = {
            id: adId,
            campaignId,
            productId: product.id,
            language,
            angle: angleId,
            angleName,
            style: style.id,
            styleName: style.name,
            headline: product.title,
            body: copy,
            callToAction: localized.callToAction,
            rtl: localized.rtl,
            effects: chosenEffects.map(({ id }) => id),
            status: 'approved',
            provider: 'local-template',
            createdAt,
          };
          const compliance = isCopyCompliant(ad, product);
          ad.status = compliance.approved ? 'approved' : 'blocked';
          ad.compliance = compliance;
          adRows.push(ad);

          await writeFile(path.join(copyDir, `${adId}.json`), `${JSON.stringify({ ...ad, dramatized: false }, null, 2)}\n`);
          const adAssets = [];
          for (const platform of platforms) {
            for (const preset of presetsFor(platform, allPresets)) {
              const filename = `${adId}-${slug(preset.id)}.svg`;
              const absolutePath = path.join(imagesDir, filename);
              await writeFile(absolutePath, svgFor({ product, copy, callToAction: localized.callToAction, style, width: preset.width, height: preset.height, rtl: localized.rtl }));
              const asset = {
                id: crypto.randomUUID(),
                campaignId,
                productId: product.id,
                adId,
                platform,
                presetId: preset.id,
                width: preset.width,
                height: preset.height,
                path: path.relative(path.resolve(outputDirectory), absolutePath),
                mimeType: 'image/svg+xml',
                rtl: localized.rtl,
                createdAt,
              };
              await store.append('assets.json', asset);
              adAssets.push(asset);
              assetRows.push(asset);
            }
          }
          await store.append('ads.json', {
            ...ad,
            assetIds: adAssets.map(({ id }) => id),
          });
        }
      }
    }

    const summary = {
      campaignId,
      productId: product.id,
      productTitle: product.title,
      adCount: adRows.length,
      languageCount: languages.length,
      assetCount: assetRows.length,
      ads: adRows.map((ad) => ({
        id: ad.id,
        language: ad.language,
        angle: ad.angle,
        style: ad.style,
        effects: ad.effects,
        assetPaths: assetRows.filter((asset) => asset.adId === ad.id).map((asset) => asset.path),
      })),
      createdAt: new Date().toISOString(),
    };
    await writeFile(path.join(productDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    const archivePath = path.join(productDir, `${slug(product.title)}-${campaignId}.zip`);
    const archiveFiles = [];
    for (const ad of adRows) {
      const copyPath = path.join(copyDir, `${ad.id}.json`);
      archiveFiles.push({ name: `copy/${ad.id}.json`, data: await readFile(copyPath) });
      for (const asset of assetRows.filter((entry) => entry.adId === ad.id)) {
        archiveFiles.push({ name: `images/${path.basename(asset.path)}`, data: await readFile(path.resolve(outputDirectory, asset.path)) });
      }
    }
    archiveFiles.push({ name: 'summary.json', data: Buffer.from(`${JSON.stringify(summary, null, 2)}\n`) });
    await makeZip(archiveFiles, archivePath);
    await store.update('campaigns.json', (item) => item.id === campaignId, (item) => ({ ...item, status: 'completed', completedAt: new Date().toISOString(), adCount: adRows.length, assetCount: assetRows.length, outputPath: path.relative(path.resolve(outputDirectory), productDir), archivePath: path.relative(path.resolve(outputDirectory), archivePath) }));
    await store.append('audit-logs.json', { id: crypto.randomUUID(), action: 'campaign-completed', campaignId, adCount: adRows.length, assetCount: assetRows.length, createdAt: new Date().toISOString() });
    await store.append('messages.json', { id: crypto.randomUUID(), type: 'campaign-completed', campaignId, message: `Generated ${adRows.length} ad variants and ${assetRows.length} image assets.`, createdAt: new Date().toISOString() });
    return { campaignId, productId: product.id, adCount: adRows.length, assetCount: assetRows.length, summary, archivePath };
  } catch (error) {
    await store.update('campaigns.json', (item) => item.id === campaignId, (item) => ({ ...item, status: 'blocked', error: error.message }));
    await store.append('audit-logs.json', { id: crypto.randomUUID(), action: 'campaign-failed', campaignId, error: error.message, createdAt: new Date().toISOString() });
    throw error;
  }
}

export function researchForProduct(product) {
  return {
    productId: product.id,
    suggestions: ['Everyday utility', 'Gift consideration', 'Seasonal discovery'],
    buyerPersonas: [product.audience || 'general shoppers'],
    keywords: String(product.title).toLowerCase().split(/\s+/).filter(Boolean),
    note: 'Suggestions only; no live market research or statistics were used.',
  };
}

export function isCopyCompliant(ad, product) {
  const text = `${ad.headline} ${ad.body} ${ad.callToAction}`;
  if (ad.effects.some((id) => dataRestrictedEffectIds.has(id))) {
    return { approved: false, reasons: ['Effect requires seller-supplied real supporting data.'] };
  }
  const reasons = [];
  if (/\b\d+(?:\.\d+)?\s*%\s*(?:off|discount)\b/i.test(text) && product.discount == null) {
    reasons.push('Discount claim has no seller-supplied discount.');
  }
  if (/\b(?:only|just)\s+\d+\s+(?:left|remaining|in stock)\b/i.test(text) && product.stockCount == null) {
    reasons.push('Stock claim has no seller-supplied stock count.');
  }
  if (/\b\d+(?:\.\d+)?\s*stars?\b|\b\d+\s+reviews?\b/i.test(text) && product.rating == null && product.reviewCount == null) {
    reasons.push('Review or rating claim has no seller-supplied supporting data.');
  }
  return { approved: reasons.length === 0, reasons };
}
