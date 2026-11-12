export function mockRes() {
  const res = {
    statusCode: 200, headers: {}, body: undefined, ended: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(n) { this.statusCode = n; return this; },
    json(b) { this.body = b; this.ended = true; return this; },
    end() { this.ended = true; return this; },
  };
  return res;
}

export function mockReq(body, { origin = 'https://shonowear.test', host = 'shonowear.test', method = 'POST', headers = {} } = {}) {
  return {
    method, body,
    headers: { ...(origin ? { origin } : {}), host, 'x-vercel-forwarded-for': '203.0.113.7', ...headers },
    socket: { remoteAddress: '127.0.0.1' },
  };
}

/** Fresh copy of a module with the given env (IS_PROD is read at import time). */
export async function load(path, env = {}) {
  const { vi } = await import('vitest');
  vi.resetModules();
  for (const k of ['VERCEL_ENV', 'NODE_ENV', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'ANTHROPIC_API_KEY',
    'AI_ENABLED', 'CHAT_ENABLED', 'AI_DAILY_BUDGET_USD', 'RESEND_API_KEY', 'RESEND_AUDIENCE_ID',
    'MAILCHIMP_API_KEY', 'MAILCHIMP_LIST_ID', 'SITE_URL', 'ALLOWED_ORIGINS', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'ADMIN_TOKEN']) delete process.env[k];
  Object.assign(process.env, env);
  return import(path);
}

export function claudeReply(text, usage = { input_tokens: 1500, output_tokens: 600 }) {
  return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text }], usage }) };
}

export const PROFILE = {
  gender: 'male', height: 175, weight: 68, bodyType: 'lean', skinTone: 'medium brown',
  aesthetic: 'streetwear', occasion: 'casual', budget: 'high',
};
