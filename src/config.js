export const DATA_FILES = [
  'studio.json',
  'agents.json',
  'sellers.json',
  'products.json',
  'campaigns.json',
  'ads.json',
  'scripts.json',
  'effects.json',
  'assets.json',
  'approvals.json',
  'messages.json',
  'audit-logs.json',
  'model-usage.json',
  'providers.json',
  'settings.json',
];

export const PROVIDERS = [
  { id: 'openrouter', name: 'OpenRouter', baseUrlEnv: 'OPENROUTER_BASE_URL', keyEnv: 'OPENROUTER_API_KEY', defaultUrl: 'https://openrouter.ai/api/v1', modelsUrl: '/models', chatUrl: '/chat/completions' },
  { id: 'omniroute', name: 'OmniRoute', baseUrlEnv: 'OMNIROUTE_BASE_URL', keyEnv: 'OMNIROUTE_API_KEY', defaultUrl: 'http://localhost:8000', modelsUrl: '/models', chatUrl: '/chat/completions', optionalKey: true },
  { id: 'gemini', name: 'Google Gemini', baseUrlEnv: null, keyEnv: 'GEMINI_API_KEY', defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', modelsUrl: '/models', chatUrl: '/chat/completions' },
  { id: 'groq', name: 'Groq', baseUrlEnv: null, keyEnv: 'GROQ_API_KEY', defaultUrl: 'https://api.groq.com/openai/v1', modelsUrl: '/models', chatUrl: '/chat/completions' },
  { id: 'ollama', name: 'Ollama', baseUrlEnv: 'OLLAMA_BASE_URL', keyEnv: null, defaultUrl: 'http://localhost:11434', modelsUrl: '/api/tags', chatUrl: '/v1/chat/completions', nativeModels: true },
];

const agentSpecs = [
  ['director', 'Director', 'Plan a truthful, diverse product campaign. Never invent product facts.'],
  ['market-researcher', 'Market Researcher', 'Suggest audience angles and seasonal themes. Label market observations as suggestions, never verified statistics.'],
  ['copywriter', 'Copywriter', 'Write concise ad copy using only supplied product facts. Never invent prices, discounts, scarcity, reviews, or claims.'],
  ['chat-scripter', 'Chat Scripter', 'Write clearly dramatized generic buyer/seller chat scripts. Do not imitate any real marketplace interface or claim the conversation is real.'],
  ['designer', 'Designer', 'Select readable, high-contrast layouts that keep all text within safe margins.'],
  ['effects-director', 'Effects Director', 'Select effects only from the provided library and never imply unsupported product facts.'],
  ['renderer', 'Renderer', 'Render the supplied copy and product facts without altering them.'],
  ['compliance-officer', 'Compliance Officer', 'Reject unsupported prices, claims, reviews, scarcity, trademark use, and unreadable text.'],
  ['packager', 'Packager', 'Prepare accurate delivery metadata and summaries.'],
  ['localization-agent', 'Localization Agent', 'Translate and culturally adapt copy without changing names, prices, discounts, or numbers. Flag right-to-left languages.'],
  ['platform-specialist', 'Platform Specialist', 'Format copy for the requested platform and record the selected size preset.'],
];

const fallbacks = {
  openrouter: [{ provider: 'gemini', model: 'gemini-2.0-flash' }, { provider: 'groq', model: 'llama-3.3-70b-versatile' }, { provider: 'ollama', model: 'llama3.1' }],
  omniroute: [{ provider: 'gemini', model: 'gemini-2.0-flash' }, { provider: 'groq', model: 'llama-3.3-70b-versatile' }, { provider: 'ollama', model: 'llama3.1' }],
  gemini: [{ provider: 'openrouter', model: 'openai/gpt-4o-mini' }, { provider: 'ollama', model: 'llama3.1' }],
  groq: [{ provider: 'gemini', model: 'gemini-2.0-flash' }, { provider: 'ollama', model: 'llama3.1' }],
};

export function defaultAgents() {
  return agentSpecs.map(([id, role, systemPrompt]) => {
    const primaryProvider = ['designer', 'effects-director', 'market-researcher'].includes(id)
      ? 'gemini'
      : ['compliance-officer', 'packager', 'platform-specialist', 'renderer'].includes(id)
        ? 'groq'
        : 'openrouter';
    const primaryModel = {
      openrouter: 'openai/gpt-4o-mini',
      gemini: 'gemini-2.0-flash',
      groq: 'llama-3.3-70b-versatile',
    }[primaryProvider];
    return {
      id,
      role,
      systemPrompt,
      primaryProvider,
      primaryModel,
      fallbacks: fallbacks[primaryProvider],
      status: 'active',
    };
  });
}

const effectNames = [
  'Typewriter reveal', 'Word-by-word pop-in', 'Slide-in from the side', 'Bounce-in', 'Glitch text', 'Neon glow text', 'Gradient shimmer sweep', 'Kinetic typography', 'Countdown ticker', 'Text masked by the product',
  'Letters falling into place', 'Price shake for emphasis', 'Old price struck through, new price pops', 'Underline draw', 'Flip-board text', 'Slow zoom in', 'Zoom-out reveal', 'Parallax float', '360 spin', 'Hover bob',
  'Drop-in with bounce', 'Slide-in with motion blur', 'Heartbeat pulse', '3D tilt', 'Whip-pan entrance', 'Pop out of a gift box', 'Growing shadow', 'Spotlight sweep', 'Floor reflection', 'Glowing outline',
  'Animated gradient', 'Confetti burst', 'Falling sparkles', 'Bokeh lights', 'Floating particles', 'Black and gold luxury', 'Neon grid', 'Stage spotlight', 'Smoke or fog', 'Fireworks',
  'Falling gift boxes', 'Rising balloons', 'Lightning flash', 'Moving stripes', 'Blurred lifestyle photo', 'Swinging price tag', 'SALE stamp slam', 'Percent-off badge burst', 'Countdown to Black Friday', 'Limited stock bar draining',
  'Doorbuster banner sweep', 'Shopping cart filling up', 'Scratch-card coupon reveal', 'Sticker peel', 'Ribbon unfurl', 'Flashing siren light', 'Price-drop arrow', 'Deal of the hour spinner', 'Gift unwrapping', 'Coin rain',
  'Cross dissolve', 'Zoom through', 'Swipe', 'Glitch cut', 'Spin', 'Shatter', 'Liquid wipe', 'White flash cut', 'Page curl', 'Circle wipe',
  'Push slide', 'Blur', 'Pixelate', 'Split screen', 'Cube rotate', 'Vibrance boost', 'Depth drop shadow', 'Duotone', 'Film grain', 'Vignette',
  'Chromatic aberration', 'Lens flare', 'Light leaks', 'Glow bloom', 'Clarity sharpen', 'Color pop with desaturated background', 'Cinematic letterbox', 'Warm or cool tint', 'Star rating fill', 'Review quote slide-in',
  'Sold counter ticking up', 'Verified badge pop', 'Free-shipping truck driving in', 'Fast-delivery clock', 'Before and after slider', 'Price comparison bars', 'Notification-style popup', 'Emoji reaction burst', 'Pulsing Buy Now button', 'Bouncing arrow',
];

const categories = [
  [1, 15, 'text-animation'], [16, 30, 'product-motion'], [31, 45, 'background'],
  [46, 60, 'black-friday'], [61, 75, 'transition'], [76, 88, 'color-filter'],
  [89, 100, 'social-proof-cta'],
];
const tierA = new Set([3, 6, 7, 12, 13, 14, 27, 30, 31, 32, 33, 34, 35, 36, 44, 46, 47, 48, 54, 55, 57, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 92, 99, 100]);

export function defaultEffects() {
  return effectNames.map((name, index) => {
    const number = index + 1;
    const [, , category] = categories.find(([start, end]) => number >= start && number <= end);
    return {
      id: `E${String(number).padStart(3, '0')}`,
      name,
      category,
      tier: [19, 29, 65, 66, 75].includes(number) ? 'C' : tierA.has(number) ? 'A' : 'B',
      renderMethod: tierA.has(number) ? 'svg' : 'video',
    };
  });
}

export function defaultProviders() {
  return PROVIDERS.map(({ id, name, baseUrlEnv }) => ({
    id,
    name,
    baseUrlEnv,
    status: 'unreachable',
    lastHealthCheck: null,
    modelList: [],
  }));
}

export function defaultSettings() {
  return {
    defaultLanguages: ['English'],
    targetPlatforms: ['eBay', 'Facebook', 'Instagram', 'TikTok', 'banner'],
    platformPresets: [
      { id: 'square', width: 1080, height: 1080, platforms: ['Instagram', 'general'] },
      { id: 'portrait', width: 1080, height: 1350, platforms: ['Facebook', 'Instagram'] },
      { id: 'story', width: 1080, height: 1920, platforms: ['Instagram', 'TikTok'] },
      { id: 'banner', width: 1200, height: 628, platforms: ['banner'] },
      { id: 'ebay-square', width: 1600, height: 1600, platforms: ['eBay'] },
    ],
    campaignBudgetUsd: 25,
    enabledProviders: [],
  };
}

export function defaultData() {
  return {
    'studio.json': { id: 'studio', name: 'AdForge Local', createdAt: new Date().toISOString() },
    'agents.json': defaultAgents(),
    'sellers.json': [],
    'products.json': [],
    'campaigns.json': [],
    'ads.json': [],
    'scripts.json': [],
    'effects.json': defaultEffects(),
    'assets.json': [],
    'approvals.json': [],
    'messages.json': [],
    'audit-logs.json': [],
    'model-usage.json': [],
    'providers.json': defaultProviders(),
    'settings.json': defaultSettings(),
  };
}
