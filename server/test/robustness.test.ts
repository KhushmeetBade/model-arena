import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { OpenRouterProvider } from '../src/providers/openrouter.js';
import { ABANDON_MS } from '../src/race.js';
import { ModelInfo, Provider, StreamArgs } from '../src/types.js';

/** Test-only stub provider. `hang` never answers until its request is aborted. */
class Stub implements Provider {
  id = 'openrouter' as const;
  label = 'stub';
  billing = 'free' as const;
  keyEnvVar = 'OPENROUTER_API_KEY';
  constructor(private names: string[]) {}
  isConfigured() {
    return true;
  }
  async listModels(): Promise<ModelInfo[]> {
    return this.names.map((n) => ({ id: `openrouter:${n}`, provider: 'openrouter', providerModel: n, name: n, free: true, available: true }));
  }
  async stream(a: StreamArgs) {
    if (a.model === 'hang') return new Promise<{ text: string }>((_, rej) => a.signal.addEventListener('abort', () => rej(new Error('aborted'))));
    a.onDelta('done');
    return { text: 'done' };
  }
}

const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-robust-'));
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe('local-only security', () => {
  const { app } = createApp({ dataDir: tmp(), providers: [new Stub(['a', 'j'])] });

  it('accepts same-origin and localhost pages, rejects other websites', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await request(app).get('/api/races').set('Origin', 'http://localhost:5173')).status).toBe(200);
    expect((await request(app).get('/api/races').set('Origin', 'http://127.0.0.1:8787')).status).toBe(200);

    const evilWrite = await request(app).post('/api/races').set('Origin', 'https://evil.example').send({ prompt: 'x', models: ['openrouter:a'] });
    expect(evilWrite.status).toBe(403);
    const evilSettings = await request(app).put('/api/settings').set('Origin', 'https://evil.example').send({ systemPrompt: 'pwned' });
    expect(evilSettings.status).toBe(403);
    expect((await request(app).get('/api/settings')).body.systemPrompt).not.toBe('pwned');
    expect((await request(app).get('/api/races').set('Origin', 'https://evil.example')).status).toBe(403);
    // form posts from other sites carry Sec-Fetch-Site even without a usable Origin
    expect((await request(app).post('/api/races/preflight').set('Sec-Fetch-Site', 'cross-site').send({ models: ['openrouter:a'] })).status).toBe(403);
    // lookalike origins are not loopback
    expect((await request(app).get('/api/races').set('Origin', 'http://localhost.evil.example')).status).toBe(403);
  });

  it('rejects DNS-rebinding (non-loopback Host header)', async () => {
    expect((await request(app).get('/api/health').set('Host', 'attacker.example:8787')).status).toBe(403);
    expect((await request(app).get('/api/health').set('Host', 'localhost:8787')).status).toBe(200);
  });

  it('only allows CORS for loopback origins', async () => {
    const ok = await request(app).options('/api/races').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('reports test mode only for the synthetic harness', async () => {
    expect((await request(app).get('/api/health')).body.mode).toBe('live');
    const harness = createApp({ dataDir: tmp(), providers: [new Stub(['a'])], mode: 'test' });
    expect((await request(harness.app).get('/api/health')).body.mode).toBe('test');
  });

  it('redirects dev page requests to the live client, but never API calls', async () => {
    const dev = createApp({ dataDir: tmp(), providers: [new Stub(['a'])], serveClient: true, devClientUrl: 'http://localhost:5173' });
    const page = await request(dev.app).get('/garage?x=1');
    expect(page.status).toBe(302);
    expect(page.headers.location).toBe('http://localhost:5173/garage?x=1');
    expect((await request(dev.app).get('/api/health')).status).toBe(200);
  });
});

describe('race robustness', () => {
  it('discards races that are created but never started', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      const { engine } = createApp({ dataDir: tmp(), providers: [new Stub(['a', 'j'])] });
      const r = await engine.create('x', ['openrouter:a']);
      expect(engine.get(r.id)).toBeTruthy();
      vi.advanceTimersByTime(ABANDON_MS + 1);
      expect(engine.get(r.id)).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('saves a race from the start and red-flags it after a restart mid-race', async () => {
    const dir = tmp();
    const first = createApp({ dataDir: dir, providers: [new Stub(['fast', 'hang', 'j'])] });
    const created = await request(first.app).post('/api/races').send({ prompt: 'x', models: ['openrouter:fast', 'openrouter:hang'] });
    await request(first.app).post(`/api/races/${created.body.id}/start`).expect(200);
    await new Promise((r) => setTimeout(r, 50)); // `fast` finishes, `hang` keeps streaming

    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'races.json'), 'utf8'));
    expect(saved[0]).toMatchObject({ id: created.body.id, status: 'running' });

    // "restart": a new server process on the same data directory
    const second = createApp({ dataDir: dir, providers: [new Stub(['fast', 'hang', 'j'])] });
    const race = (await request(second.app).get(`/api/races/${created.body.id}`)).body;
    expect(race.status).toBe('failed');
    expect(race.events.at(-1)).toMatchObject({ type: 'race.failed' });
    expect(race.events.at(-1).data.error).toMatch(/restarted mid-race/);
    expect(race.competitors.find((c: any) => c.modelId === 'openrouter:fast').status).toBe('finished');
    expect(race.competitors.find((c: any) => c.modelId === 'openrouter:hang')).toMatchObject({ status: 'dnf', error: 'server restarted' });
    // failed races appear in Replays but never count for the leaderboard
    expect((await request(second.app).get('/api/races')).body.races).toHaveLength(1);
    expect((await request(second.app).get('/api/leaderboard')).body.rows).toHaveLength(0);
  });
});

describe('OpenRouter error messages', () => {
  const fail = async (body: string) => {
    process.env.OPENROUTER_API_KEY ||= 'test-key-not-real';
    const f = (async () => new Response(body, { status: 429 })) as unknown as typeof fetch;
    return new OpenRouterProvider(f)
      .stream({ model: 'm:free', prompt: 'x', maxTokens: 5, signal: new AbortController().signal, onDelta: () => undefined })
      .catch((e) => e as Error & { kind: string });
  };

  it('never shows OpenRouter paid upsells (own provider key / buy credits)', async () => {
    const upstream = await fail(
      JSON.stringify({ error: { code: 429, message: 'g/m:free is temporarily rate-limited upstream. Please retry shortly, or add your own provider key to use your own limits: https://openrouter.ai/workspaces/default/byok' } }),
    );
    expect(upstream.message).toMatch(/Please retry shortly\.$/);
    expect(upstream.message).not.toMatch(/provider key|byok|openrouter\.ai/i);
    expect(upstream.kind).toBe('rate_limit');

    const daily = await fail(JSON.stringify({ error: { code: 429, message: 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day' } }));
    expect(daily.message).not.toMatch(/credits/i);
    expect(daily.kind).toBe('daily_quota');
  });
});
