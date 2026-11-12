import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockReq, mockRes, load } from './helpers.js';

let fetchMock;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('/api/subscribe', () => {
  const body = { email: 'Person@Example.com', website: '' };

  it('does NOT remember an address when the provider fails, so a retry works', async () => {
    const { default: h } = await load('../api/subscribe.js', { RESEND_API_KEY: 'r', RESEND_AUDIENCE_ID: 'a' });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const r1 = mockRes(); await h(mockReq(body), r1);
    expect(r1.statusCode).toBe(500);

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    const r2 = mockRes(); await h(mockReq(body), r2);
    expect(r2.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2); // the retry actually reached the provider
  });
  it('skips the provider for an address already added', async () => {
    const { default: h } = await load('../api/subscribe.js', { RESEND_API_KEY: 'r', RESEND_AUDIENCE_ID: 'a' });
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    await h(mockReq(body), mockRes());
    await h(mockReq({ ...body, email: 'person@example.com' }), mockRes());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('reports confirm:true only for Mailchimp double opt-in', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    let { default: h } = await load('../api/subscribe.js', { MAILCHIMP_API_KEY: 'k-us1', MAILCHIMP_LIST_ID: 'l' });
    let res = mockRes(); await h(mockReq(body), res);
    expect(res.body.confirm).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).status).toBe('pending');

    ({ default: h } = await load('../api/subscribe.js', { RESEND_API_KEY: 'r', RESEND_AUDIENCE_ID: 'a' }));
    res = mockRes(); await h(mockReq({ email: 'other@example.com' }), res);
    expect(res.body.confirm).toBe(false);
  });
  it('never stores the raw email in the store key', async () => {
    const { default: h } = await load('../api/subscribe.js', {
      VERCEL_ENV: 'production', RESEND_API_KEY: 'r', RESEND_AUDIENCE_ID: 'a',
      UPSTASH_REDIS_REST_URL: 'https://u.example', UPSTASH_REDIS_REST_TOKEN: 't',
    });
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).includes('u.example')) {
        const cmds = JSON.parse(init.body);
        return { ok: true, json: async () => cmds.map(c => ({ result: c[0] === 'GET' ? null : 1 })) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    await h(mockReq(body), mockRes());
    const stored = fetchMock.mock.calls.filter(c => String(c[0]).includes('u.example')).map(c => c[1].body).join('');
    expect(stored).not.toMatch(/example\.com/i);
    expect(stored).toMatch(/sub:[0-9a-f]{64}/);
  });
  it('returns 503 in production when no provider is configured', async () => {
    const { default: h } = await load('../api/subscribe.js', { VERCEL_ENV: 'production' });
    const res = mockRes(); await h(mockReq(body), res);
    expect(res.statusCode).toBe(503);
  });
  it('honeypot returns ok without calling anything', async () => {
    const { default: h } = await load('../api/subscribe.js', { RESEND_API_KEY: 'r', RESEND_AUDIENCE_ID: 'a' });
    const res = mockRes(); await h(mockReq({ ...body, website: 'http://spam' }), res);
    expect(res.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects disposable domains', async () => {
    const { default: h } = await load('../api/subscribe.js', { RESEND_API_KEY: 'r', RESEND_AUDIENCE_ID: 'a' });
    const res = mockRes(); await h(mockReq({ email: 'x@mailinator.com' }), res);
    expect(res.statusCode).toBe(400);
  });
});
