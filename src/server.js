import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JsonStore } from './storage.js';
import { PROVIDERS } from './config.js';
import { providerStatus, routeChat, testProvider } from './ai.js';
import { generateCampaign, researchForProduct } from './pipeline.js';
import { localizedCopy } from './localization.js';

function loadDotEnv() {
  return readFile('.env', 'utf8').then((text) => {
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || Object.hasOwn(process.env, match[1])) continue;
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

function send(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 5 * 1024 * 1024) throw Object.assign(new Error('Request body exceeds 5 MB'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON'), { statusCode: 400 });
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted && character === '"' && text[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) throw Object.assign(new Error('CSV contains an unterminated quoted field'), { statusCode: 400 });
  if (field || row.length) {
    row.push(field.trim());
    if (row.some(Boolean)) rows.push(row);
  }
  if (rows.length < 2) throw Object.assign(new Error('CSV must include a header and at least one product'), { statusCode: 400 });
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  if (!headers.includes('title')) throw Object.assign(new Error('CSV requires a title column'), { statusCode: 400 });
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
}

function normalizeProduct(input) {
  const title = typeof input.title === 'string' ? input.title.trim().replace(/\s+/g, ' ') : '';
  const price = input.price === '' || input.price == null ? null : Number(input.price);
  if (!title) throw Object.assign(new Error('Product title is required'), { statusCode: 400 });
  if (title.length > 200) throw Object.assign(new Error('Product title must be 200 characters or fewer'), { statusCode: 400 });
  if (price != null && (!Number.isFinite(price) || price < 0)) throw Object.assign(new Error('Product price must be a non-negative number'), { statusCode: 400 });
  const optionalNumber = (value, label, { minimum = 0, maximum = Number.POSITIVE_INFINITY } = {}) => {
    if (value == null || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < minimum || number > maximum) {
      throw Object.assign(new Error(`${label} must be between ${minimum} and ${maximum}`), { statusCode: 400 });
    }
    return number;
  };
  const arrayField = (value, fallback = []) => Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()) : fallback;
  const languages = arrayField(input.languages, ['English']);
  for (const language of languages.length ? languages : ['English']) localizedCopy(language, { title, price });
  const stockCount = optionalNumber(input.stockCount, 'stockCount');
  const reviewCount = optionalNumber(input.reviewCount, 'reviewCount');
  if (stockCount != null && !Number.isInteger(stockCount)) throw Object.assign(new Error('stockCount must be a whole number'), { statusCode: 400 });
  if (reviewCount != null && !Number.isInteger(reviewCount)) throw Object.assign(new Error('reviewCount must be a whole number'), { statusCode: 400 });
  return {
    id: crypto.randomUUID(),
    title,
    price,
    originalPrice: optionalNumber(input.originalPrice, 'originalPrice'),
    currency: typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : null,
    description: typeof input.description === 'string' ? input.description.trim().slice(0, 4000) : '',
    ebayListingUrl: typeof input.ebayListingUrl === 'string' ? input.ebayListingUrl : null,
    stockCount,
    rating: optionalNumber(input.rating, 'rating', { maximum: 5 }),
    reviewCount,
    reviewText: typeof input.reviewText === 'string' ? input.reviewText : null,
    brandColors: arrayField(input.brandColors),
    targetAudience: typeof input.targetAudience === 'string' ? input.targetAudience.trim() : '',
    targetPlatforms: arrayField(input.targetPlatforms, ['Instagram']),
    languages,
    imagePaths: arrayField(input.imagePaths),
    createdAt: new Date().toISOString(),
    status: 'queued',
  };
}

function parseCsvProduct(row) {
  const split = (value) => String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  return {
    ...row,
    price: row.price ? Number(row.price) : null,
    brandColors: split(row.brandcolors),
    targetPlatforms: split(row.targetplatforms),
    languages: split(row.languages),
    targetAudience: row.audience ?? row.targetaudience ?? '',
  };
}

export function createApp({ store = new JsonStore(), outputDirectory = process.env.OUTPUT_DIR || './output' } = {}) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const method = request.method ?? 'GET';
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (method === 'GET' && pathname === '/health') {
        return send(response, 200, { ok: true, service: 'adforge-local', timestamp: new Date().toISOString() });
      }

      if (method === 'GET' && pathname === '/adforge/status') {
        const [products, campaigns, ads, assets, approvals] = await Promise.all([
          store.read('products.json'), store.read('campaigns.json'), store.read('ads.json'),
          store.read('assets.json'), store.read('approvals.json'),
        ]);
        return send(response, 200, {
          products: products.length,
          campaigns: campaigns.length,
          ads: ads.length,
          assets: assets.length,
          pendingApprovals: approvals.filter((item) => item.status === 'pending').length,
          gallery: assets.map(({ id, adId, platform, presetId, path }) => ({
            id,
            adId,
            platform,
            presetId,
            path,
            url: `/adforge/files/${path.split('/').map(encodeURIComponent).join('/')}`,
          })),
          generatedAt: new Date().toISOString(),
        });
      }

      const collections = {
        '/adforge/products': 'products.json',
        '/adforge/campaigns': 'campaigns.json',
        '/adforge/ads': 'ads.json',
        '/adforge/assets': 'assets.json',
        '/adforge/agents': 'agents.json',
        '/adforge/effects': 'effects.json',
        '/adforge/approvals': 'approvals.json',
      };
      if (method === 'GET' && collections[pathname]) {
        let rows = await store.read(collections[pathname]);
        const campaignId = url.searchParams.get('campaignId');
        const productId = url.searchParams.get('productId');
        if (campaignId) rows = rows.filter((item) => item.campaignId === campaignId);
        if (productId) rows = rows.filter((item) => item.productId === productId);
        return send(response, 200, rows);
      }

      if (method === 'GET' && pathname === '/adforge/platforms') {
        return send(response, 200, (await store.read('settings.json')).platformPresets);
      }

      const fileMatch = pathname.match(/^\/adforge\/files\/(.+)$/);
      if (method === 'GET' && fileMatch) {
        const outputRoot = path.resolve(outputDirectory);
        const filePath = path.resolve(outputRoot, decodeURIComponent(fileMatch[1]));
        if (!filePath.startsWith(`${outputRoot}${path.sep}`)) return send(response, 403, { error: 'Path is outside the output directory' });
        const extension = path.extname(filePath).toLowerCase();
        const contentTypes = { '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.zip': 'application/zip' };
        if (!contentTypes[extension]) return send(response, 415, { error: 'File type is not available' });
        const fileStat = await stat(filePath);
        if (!fileStat.isFile()) return send(response, 404, { error: 'File not found' });
        const content = await readFile(filePath);
        response.writeHead(200, {
          'Content-Type': contentTypes[extension],
          'Content-Length': content.length,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        return response.end(content);
      }

      const researchMatch = pathname.match(/^\/adforge\/research\/([^/]+)$/);
      if (method === 'GET' && researchMatch) {
        const product = (await store.read('products.json')).find((item) => item.id === decodeURIComponent(researchMatch[1]));
        if (!product) return send(response, 404, { error: 'Product not found' });
        return send(response, 200, researchForProduct(product));
      }

      if (method === 'GET' && pathname === '/adforge/providers') {
        const providers = await store.read('providers.json');
        return send(response, 200, providers.map((provider) => ({
          ...provider,
          status: providerStatus(provider.id) === 'missing_key' ? 'missing_key' : provider.status,
        })));
      }

      const providerTestMatch = pathname.match(/^\/adforge\/providers\/([^/]+)\/test$/);
      if (method === 'POST' && providerTestMatch) {
        const providerId = decodeURIComponent(providerTestMatch[1]);
        if (!PROVIDERS.some((provider) => provider.id === providerId)) return send(response, 404, { error: 'Provider not found' });
        const result = await testProvider(providerId);
        const updated = await store.update('providers.json', (provider) => provider.id === providerId, (provider) => ({
          ...provider,
          status: result.status,
          lastHealthCheck: new Date().toISOString(),
          modelList: result.models,
        }));
        await store.append('audit-logs.json', { id: crypto.randomUUID(), action: 'provider-health-check', provider: providerId, status: result.status, error: result.error, createdAt: new Date().toISOString() });
        return send(response, result.status === 'connected' ? 200 : 502, { ...updated, error: result.error });
      }

      if (method === 'GET' && pathname === '/adforge/models') {
        const providerId = url.searchParams.get('provider');
        const providers = await store.read('providers.json');
        if (providerId) {
          const provider = providers.find((item) => item.id === providerId);
          if (!provider) return send(response, 404, { error: 'Provider not found' });
          return send(response, 200, { provider: providerId, models: provider.modelList, status: provider.status });
        }
        return send(response, 200, providers.map(({ id, modelList, status }) => ({ provider: id, models: modelList, status })));
      }

      if (method === 'PATCH' && pathname === '/adforge/settings/languages') {
        const body = await readBody(request);
        if (!Array.isArray(body.languages) || !body.languages.length || body.languages.some((language) => typeof language !== 'string' || !language.trim())) {
          return send(response, 400, { error: 'languages must be a non-empty array of strings' });
        }
        try {
          for (const language of body.languages) localizedCopy(language, { title: 'product' });
        } catch (error) {
          return send(response, 400, { error: error.message });
        }
        const settings = await store.read('settings.json');
        settings.defaultLanguages = [...new Set(body.languages.map((language) => language.trim()))];
        await store.write('settings.json', settings);
        return send(response, 200, settings);
      }

      if (method === 'PATCH' && pathname === '/adforge/settings/providers') {
        const body = await readBody(request);
        if (!Array.isArray(body.enabledProviders) || body.enabledProviders.some((id) => !PROVIDERS.some((provider) => provider.id === id))) {
          return send(response, 400, { error: 'enabledProviders must contain only supported provider IDs' });
        }
        const settings = await store.read('settings.json');
        settings.enabledProviders = [...new Set(body.enabledProviders)];
        await store.write('settings.json', settings);
        return send(response, 200, settings);
      }

      const agentModelMatch = pathname.match(/^\/adforge\/agents\/([^/]+)\/model$/);
      if (method === 'PATCH' && agentModelMatch) {
        const agentId = decodeURIComponent(agentModelMatch[1]);
        const body = await readBody(request);
        if (typeof body.provider !== 'string' || typeof body.model !== 'string' || !body.model.trim()) {
          return send(response, 400, { error: 'provider and model are required' });
        }
        if (!PROVIDERS.some((provider) => provider.id === body.provider)) return send(response, 400, { error: 'Unsupported provider' });
        const provider = (await store.read('providers.json')).find((item) => item.id === body.provider);
        if (!provider?.modelList.includes(body.model)) return send(response, 400, { error: 'Test the provider and select a model from its cached model list first' });
        const agent = await store.update('agents.json', (item) => item.id === agentId, (item) => ({ ...item, primaryProvider: body.provider, primaryModel: body.model }));
        if (!agent) return send(response, 404, { error: 'Agent not found' });
        return send(response, 200, agent);
      }

      if (method === 'POST' && pathname === '/adforge/product') {
        const body = await readBody(request);
        const product = normalizeProduct(body);
        await store.append('products.json', product);
        await store.append('messages.json', { id: crypto.randomUUID(), type: 'product-created', productId: product.id, message: 'Product intake accepted.', createdAt: new Date().toISOString() });
        return send(response, 201, { ok: true, product });
      }

      if (method === 'POST' && pathname === '/adforge/products/import') {
        const body = await readBody(request);
        if (typeof body.csv !== 'string') return send(response, 400, { error: 'csv string is required' });
        const products = parseCsv(body.csv).map(parseCsvProduct).map(normalizeProduct);
        for (const product of products) await store.append('products.json', product);
        return send(response, 201, { imported: products.length, products });
      }

      if (method === 'POST' && pathname === '/adforge/campaign') {
        const body = await readBody(request);
        if (typeof body.productId !== 'string') return send(response, 400, { error: 'productId is required' });
        const product = (await store.read('products.json')).find((item) => item.id === body.productId);
        if (!product) return send(response, 404, { error: 'Product not found' });
        const campaign = {
          id: crypto.randomUUID(),
          productId: product.id,
          name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : `${product.title} campaign`,
          status: 'draft',
          createdAt: new Date().toISOString(),
          research: researchForProduct(product),
        };
        await store.append('campaigns.json', campaign);
        return send(response, 201, { ok: true, campaign });
      }

      const startMatch = pathname.match(/^\/adforge\/campaign\/([^/]+)\/start$/);
      if (method === 'POST' && startMatch) {
        const campaignId = decodeURIComponent(startMatch[1]);
        const campaign = (await store.read('campaigns.json')).find((item) => item.id === campaignId);
        if (!campaign) return send(response, 404, { error: 'Campaign not found' });
        if (campaign.status !== 'draft') return send(response, 409, { error: `Campaign is ${campaign.status} and cannot be started again` });
        const result = await generateCampaign(store, campaignId, outputDirectory);
        return send(response, 200, { ok: true, ...result });
      }

      if (method === 'POST' && pathname === '/adforge/approval') {
        const body = await readBody(request);
        if (typeof body.action !== 'string' || !body.action.trim()) return send(response, 400, { error: 'action is required' });
        const approval = {
          id: crypto.randomUUID(),
          action: body.action.trim(),
          details: body.details ?? {},
          status: 'pending',
          createdAt: new Date().toISOString(),
        };
        await store.append('approvals.json', approval);
        return send(response, 201, approval);
      }

      const approvalMatch = pathname.match(/^\/adforge\/approval\/([^/]+)\/(approve|reject)$/);
      if (method === 'POST' && approvalMatch) {
        const approvalId = decodeURIComponent(approvalMatch[1]);
        const status = approvalMatch[2] === 'approve' ? 'approved' : 'rejected';
        const approval = await store.update('approvals.json', (item) => item.id === approvalId && item.status === 'pending', (item) => ({ ...item, status, resolvedAt: new Date().toISOString() }));
        if (!approval) return send(response, 404, { error: 'Pending approval not found' });
        return send(response, 200, approval);
      }

      if (method === 'POST' && pathname === '/adforge/ai/chat') {
        const body = await readBody(request);
        const agent = (await store.read('agents.json')).find((item) => item.id === body.agentId);
        if (!agent) return send(response, 404, { error: 'Agent not found' });
        if (!Array.isArray(body.messages) || !body.messages.length || body.messages.some((item) => !item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string')) {
          return send(response, 400, { error: 'messages must be a non-empty array of user/assistant messages' });
        }
        const result = await routeChat(store, {
          agent,
          messages: [{ role: 'system', content: agent.systemPrompt }, ...body.messages],
          temperature: Number.isFinite(body.temperature) ? body.temperature : 0.4,
        });
        return send(response, 200, result);
      }

      return send(response, 404, { error: 'Route not found' });
    } catch (error) {
      const status = error.statusCode ?? 500;
      if (status >= 500) {
        await store.append('audit-logs.json', {
          id: crypto.randomUUID(),
          action: 'request-error',
          method,
          path: pathname,
          error: error.message,
          createdAt: new Date().toISOString(),
        }).catch(() => {});
        console.error(`${method} ${pathname}: ${error.message}`);
      }
      if (!response.headersSent) send(response, status, { error: error.message });
      else response.destroy();
    }
  });
  return { server, store };
}

async function main() {
  await loadDotEnv();
  const store = new JsonStore();
  await store.init();
  const { server } = createApp({ store });
  const port = Number(process.env.PORT || 3000);
  server.listen(port, '127.0.0.1', () => {
    console.log(`AdForge Local listening at http://127.0.0.1:${port}`);
    for (const provider of PROVIDERS) {
      testProvider(provider.id).then(async (result) => {
        await store.update('providers.json', (item) => item.id === provider.id, (item) => ({
          ...item,
          status: result.status,
          lastHealthCheck: new Date().toISOString(),
          modelList: result.models,
        }));
      }).catch((error) => {
        console.error(`Startup health check for ${provider.id} failed: ${error.message}`);
      });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Unable to start AdForge: ${error.message}`);
    process.exitCode = 1;
  });
}
