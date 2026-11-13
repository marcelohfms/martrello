import { describe, it, expect, vi } from 'vitest';
import { createSlackClient, SlackError } from './client';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

async function catchErr(p: Promise<unknown>): Promise<SlackError> {
  try { await p; } catch (e) { return e as SlackError; }
  throw new Error('não lançou');
}

describe('createSlackClient', () => {
  it('postMessage monta o POST', async () => {
    const f = vi.fn().mockResolvedValue(json({ ok: true }));
    await createSlackClient('xoxb-t', f as unknown as typeof fetch).postMessage('C1', 'oi');
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer xoxb-t');
    expect(init.headers['Content-Type']).toBe('application/json; charset=utf-8');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual({ channel: 'C1', text: 'oi', unfurl_links: false, unfurl_media: false });
  });

  it('ok:false vira SlackError não retentável', async () => {
    const f = vi.fn().mockResolvedValue(json({ ok: false, error: 'not_in_channel' }));
    const e = await catchErr(createSlackClient('t', f as unknown as typeof fetch).postMessage('C1', 'x'));
    expect(e).toBeInstanceOf(SlackError);
    expect(e.name).toBe('SlackError');
    expect(e.code).toBe('not_in_channel');
    expect(e.retryable).toBe(false);
  });

  it('ratelimited e HTTP 503 são retentáveis', async () => {
    const rl = vi.fn().mockResolvedValue(json({ ok: false, error: 'ratelimited' }));
    const e1 = await catchErr(createSlackClient('t', rl as unknown as typeof fetch).postMessage('C1', 'x'));
    expect(e1.code).toBe('ratelimited');
    expect(e1.retryable).toBe(true);
    const f503 = vi.fn().mockResolvedValue(new Response('x', { status: 503 }));
    const e2 = await catchErr(createSlackClient('t', f503 as unknown as typeof fetch).postMessage('C1', 'x'));
    expect(e2.code).toBe('http_503');
    expect(e2.retryable).toBe(true);
    const f429 = vi.fn().mockResolvedValue(new Response('x', { status: 429 }));
    const e3 = await catchErr(createSlackClient('t', f429 as unknown as typeof fetch).postMessage('C1', 'x'));
    expect(e3.code).toBe('http_429');
    expect(e3.retryable).toBe(true);
  });

  it('conexão recusada é retentável; timeout é ambíguo', async () => {
    const refused = vi.fn().mockRejectedValue(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }));
    const e1 = await catchErr(createSlackClient('t', refused as unknown as typeof fetch).postMessage('C1', 'x'));
    expect(e1.code).toBe('ECONNREFUSED');
    expect(e1.retryable).toBe(true);
    const timeout = vi.fn().mockRejectedValue(new DOMException('x', 'TimeoutError'));
    const e2 = await catchErr(createSlackClient('t', timeout as unknown as typeof fetch).postMessage('C1', 'x'));
    expect(e2.code).toBe('ambiguous');
    expect(e2.retryable).toBe(false);
    const reset = vi.fn().mockRejectedValue(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }));
    const e3 = await catchErr(createSlackClient('t', reset as unknown as typeof fetch).postMessage('C1', 'x'));
    expect(e3.code).toBe('ambiguous');
    expect(e3.retryable).toBe(false);
  });

  it('lookupUserIdByEmail devolve o id, null para users_not_found e lança nos outros erros', async () => {
    const ok = vi.fn().mockResolvedValue(json({ ok: true, user: { id: 'U1' } }));
    expect(await createSlackClient('t', ok as unknown as typeof fetch).lookupUserIdByEmail('a@b.c')).toBe('U1');
    const [url, init] = ok.mock.calls[0];
    expect(url).toBe('https://slack.com/api/users.lookupByEmail');
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(String(init.body)).toBe('email=a%40b.c');

    const nf = vi.fn().mockResolvedValue(json({ ok: false, error: 'users_not_found' }));
    expect(await createSlackClient('t', nf as unknown as typeof fetch).lookupUserIdByEmail('a@b.c')).toBeNull();

    const bad = vi.fn().mockResolvedValue(json({ ok: false, error: 'missing_scope' }));
    const e = await catchErr(createSlackClient('t', bad as unknown as typeof fetch).lookupUserIdByEmail('a@b.c'));
    expect(e.code).toBe('missing_scope');
  });

  it('listBotChannels segue o cursor', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(json({ ok: true, channels: [{ id: 'C2', name: 'zeta' }], response_metadata: { next_cursor: 'abc' } }))
      .mockResolvedValueOnce(json({ ok: true, channels: [{ id: 'C1', name: 'alfa', extra: 1 }], response_metadata: { next_cursor: '' } }));
    const list = await createSlackClient('t', f as unknown as typeof fetch).listBotChannels();
    expect(list).toEqual([{ id: 'C1', name: 'alfa' }, { id: 'C2', name: 'zeta' }]);
    expect(f).toHaveBeenCalledTimes(2);
    const p1 = new URLSearchParams(String(f.mock.calls[0][1].body));
    expect(p1.get('types')).toBe('public_channel,private_channel');
    expect(p1.get('exclude_archived')).toBe('true');
    expect(p1.get('limit')).toBe('200');
    expect(p1.has('cursor')).toBe(false);
    expect(new URLSearchParams(String(f.mock.calls[1][1].body)).get('cursor')).toBe('abc');
  });

  it('listBotChannels para após 20 páginas', async () => {
    const f = vi.fn().mockImplementation(async () =>
      json({ ok: true, channels: [], response_metadata: { next_cursor: 'sempre' } }),
    );
    await createSlackClient('t', f as unknown as typeof fetch).listBotChannels();
    expect(f).toHaveBeenCalledTimes(20);
  });
});
