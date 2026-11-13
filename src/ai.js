import { PROVIDERS } from './config.js';

const timeoutMs = 30_000;

function providerConfig(providerId) {
  const provider = PROVIDERS.find((item) => item.id === providerId);
  if (!provider) throw new Error(`Unknown AI provider: ${providerId}`);
  const baseUrl = provider.baseUrlEnv ? process.env[provider.baseUrlEnv] || provider.defaultUrl : provider.defaultUrl;
  const key = provider.keyEnv ? process.env[provider.keyEnv] : undefined;
  return { ...provider, baseUrl: baseUrl.replace(/\/+$/, ''), key };
}

export function providerStatus(providerId) {
  const provider = providerConfig(providerId);
  if (provider.keyEnv && !provider.key && !provider.optionalKey) return 'missing_key';
  return 'unreachable';
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.text();
    let result;
    try {
      result = body ? JSON.parse(body) : {};
    } catch {
      result = { message: body };
    }
    if (!response.ok) {
      const error = new Error(result.error?.message || result.message || `Provider returned HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

export async function listProviderModels(providerId) {
  const provider = providerConfig(providerId);
  const status = providerStatus(providerId);
  if (status === 'missing_key') throw new Error(`Missing ${provider.keyEnv}`);
  const headers = provider.key ? { Authorization: `Bearer ${provider.key}` } : {};
  const result = await fetchJson(`${provider.baseUrl}${provider.modelsUrl}`, { headers });
  const models = provider.nativeModels
    ? (result.models ?? []).map((model) => model.name).filter(Boolean)
    : (result.data ?? []).map((model) => model.id).filter(Boolean);
  return models;
}

export async function testProvider(providerId) {
  const provider = providerConfig(providerId);
  const status = providerStatus(providerId);
  if (status === 'missing_key') return { status, models: [], error: `Missing ${provider.keyEnv}` };
  try {
    const models = await listProviderModels(providerId);
    if (!models.length) return { status: 'unreachable', models, error: 'Provider returned no available models' };
    await chatOnce(providerId, models[0], [{ role: 'user', content: 'Reply with OK.' }], 0);
    return { status: 'connected', models, error: null };
  } catch (error) {
    return { status: 'unreachable', models: [], error: error.message };
  }
}

async function chatOnce(providerId, model, messages, temperature) {
  const provider = providerConfig(providerId);
  const status = providerStatus(providerId);
  if (status === 'missing_key') throw new Error(`Missing ${provider.keyEnv}`);
  const started = Date.now();
  const result = await fetchJson(`${provider.baseUrl}${provider.chatUrl}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(provider.key ? { Authorization: `Bearer ${provider.key}` } : {}),
    },
    body: JSON.stringify({ model, messages, temperature }),
  });
  const choice = result.choices?.[0]?.message?.content;
  if (typeof choice !== 'string' || !choice.trim()) throw new Error('Provider returned an empty reply');
  return {
    content: choice,
    usage: result.usage ?? {},
    latencyMs: Date.now() - started,
  };
}

export async function routeChat(store, { agent, messages, temperature = 0.4 }) {
  const settings = await store.read('settings.json');
  const enabled = new Set(settings.enabledProviders ?? []);
  const candidates = [
    { provider: agent.primaryProvider, model: agent.primaryModel },
    ...(agent.fallbacks ?? []),
  ].filter((item, index, list) => enabled.has(item.provider)
    && list.findIndex((other) => other.provider === item.provider && other.model === item.model) === index);

  if (!candidates.length) {
    throw new Error('No enabled provider is available for this agent. Enable one in settings before sending seller data.');
  }

  const failures = [];
  for (const candidate of candidates) {
    const status = providerStatus(candidate.provider);
    if (status === 'missing_key') {
      failures.push({ ...candidate, error: 'missing_key' });
      continue;
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const started = Date.now();
      try {
        const reply = await chatOnce(candidate.provider, candidate.model, messages, temperature);
        await store.append('model-usage.json', {
          id: crypto.randomUUID(),
          agent: agent.id,
          provider: candidate.provider,
          model: candidate.model,
          inputTokens: reply.usage.prompt_tokens ?? null,
          outputTokens: reply.usage.completion_tokens ?? null,
          latencyMs: reply.latencyMs,
          success: true,
          estimatedCost: null,
          createdAt: new Date().toISOString(),
        });
        return { ...reply, provider: candidate.provider, model: candidate.model };
      } catch (error) {
        const delay = 250 * (2 ** attempt);
        await store.append('model-usage.json', {
          id: crypto.randomUUID(),
          agent: agent.id,
          provider: candidate.provider,
          model: candidate.model,
          inputTokens: null,
          outputTokens: null,
          latencyMs: Date.now() - started,
          success: false,
          error: error.message,
          createdAt: new Date().toISOString(),
        });
        if (attempt < 2 && (error.status === 429 || error.status >= 500 || !error.status || /empty reply/i.test(error.message))) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        failures.push({ ...candidate, error: error.message });
        await store.append('audit-logs.json', {
          id: crypto.randomUUID(),
          action: 'provider-fallback',
          agent: agent.id,
          provider: candidate.provider,
          error: error.message,
          createdAt: new Date().toISOString(),
        });
        break;
      }
    }
  }
  throw new Error(`All enabled AI providers failed: ${failures.map((item) => `${item.provider}: ${item.error}`).join('; ')}`);
}
