import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { filterFreeModels, isZeroPrice } from '../src/providers/openrouter.js';
import { QuotaManager } from '../src/quota.js';
import { JUDGE_MAX_TOKENS, MAX_JUDGE_ATTEMPTS } from '../src/race.js';
import { ModelInfo, Provider, ProviderError, ProviderId, StreamArgs } from '../src/types.js';

/**
 * Test-only stub providers (never registered by the real server). They record every call
 * so the tests can prove which requests were — and were not — made.
 */
type Behaviour = (a: StreamArgs) => Promise<{ text: string }> | { text: string };

class RecordingProvider implements Provider {
  label = 'recording stub';
  keyEnvVar: string;
  calls: StreamArgs[] = [];
  listCalls = 0;
  constructor(
    public id: ProviderId,
    public billing: 'free' | 'paid',
    private names: string[],
    private behaviour: Record<string, Behaviour>,
    private configured = true,
  ) {
    this.keyEnvVar = id === 'openrouter' ? 'OPENROUTER_API_KEY' : `${id.toUpperCase()}_API_KEY`;
  }
  isConfigured() {
    return this.configured;
  }
  async listModels(): Promise<ModelInfo[]> {
    this.listCalls++;
    return this.names.map((n) => ({ id: `${this.id}:${n}`, provider: this.id, providerModel: n, name: n.toUpperCase(), free: this.billing === 'free', available: true }));
  }
  async stream(a: StreamArgs) {
    this.calls.push(a);
    const b = this.behaviour[a.model];
    if (b) return b(a);
    a.onDelta(`answer from ${a.model}`);
    return { text: `answer from ${a.model}` };
  }
}

const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-safety-'));
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const verdict = (labels: string[]) =>
  JSON.stringify({ scores: Object.fromEntries(labels.map((l) => [l, { accuracy: 7, helpfulness: 7, clarity: 7, completeness: 7, comment: 'ok' }])), summary: 's' });

/** Creates and starts a race, waits for the SSE stream to end, returns the final record. */
async function runRace(app: Parameters<typeof request>[0], models: string[]) {
  const created = await request(app).post('/api/races').send({ prompt: 'Q?', models });
  if (created.status !== 201) return { created, race: null as any };
  const id = created.body.id;
  const streamP = request(app)
    .get(`/api/races/${id}/stream`)
    .buffer(true)
    .parse((res, cb) => {
      let d = '';
      res.on('data', (c: Buffer) => (d += c));
      res.on('end', () => cb(null, d));
    });
  await new Promise((r) => setTimeout(r, 30));
  await request(app).post(`/api/races/${id}/start`).expect(200);
  await streamP;
  return { created, race: (await request(app).get(`/api/races/${id}`)).body };
}

describe('free-model filter', () => {
  const m = (id: string, pricing: Record<string, string> | undefined, out = ['text']) => ({ id, name: id, pricing, architecture: { output_modalities: out } });

  it('accepts only :free text models whose every pricing field is exactly 0', () => {
    expect(isZeroPrice({ prompt: '0', completion: '0' })).toBe(true);
    expect(isZeroPrice({ prompt: '0', completion: '0', request: '0', image: '0', web_search: '0', internal_reasoning: '0' })).toBe(true);
    expect(isZeroPrice({ prompt: '0', completion: '0', image: '0.001' })).toBe(false); // hidden non-zero field
    expect(isZeroPrice({ prompt: '0', completion: '0', internal_reasoning: '0.0000001' })).toBe(false);
    expect(isZeroPrice({ prompt: '0' })).toBe(false); // completion price missing
    expect(isZeroPrice({ prompt: '0', completion: '' })).toBe(false);
    expect(isZeroPrice({ prompt: '0', completion: 'abc' })).toBe(false);
    expect(isZeroPrice(undefined)).toBe(false);

    const kept = filterFreeModels([
      m('a/good:free', { prompt: '0', completion: '0' }),
      m('a/paid-extra:free', { prompt: '0', completion: '0', web_search: '0.004' }),
      m('a/zero-but-not-free', { prompt: '0', completion: '0' }), // e.g. openrouter/free router
      m('a/paid:free', { prompt: '0.000001', completion: '0' }),
      m('a/music:free', { prompt: '0', completion: '0' }, ['audio']),
      m('a/no-pricing:free', undefined),
    ]).map((x) => x.id);
    expect(kept).toEqual(['a/good:free']);
  });
});

describe('quota preflight', () => {
  it('checks the whole race budget against daily, per-minute and paused limits without recording usage', () => {
    let now = Date.UTC(2026, 0, 1, 12);
    const q = new QuotaManager(null, () => now);
    q.setLimits('openrouter', { dailyLimit: 10, rpm: 6 });

    const ok = q.preflight({ openrouter: 6 });
    expect(ok.ok).toBe(true);
    expect(ok.providers.openrouter).toMatchObject({ needed: 6, remainingToday: 10, remainingMinute: 6 });
    expect(q.snapshot().providers.openrouter.requestsToday).toBe(0); // read-only

    expect(q.preflight({ openrouter: 7 }).reason).toMatch(/Per-minute limit.*7.*6/);

    for (let i = 0; i < 6; i++) q.recordRequest('openrouter');
    now += 61_000;
    const daily = q.preflight({ openrouter: 5 });
    expect(daily.ok).toBe(false);
    expect(daily.reason).toMatch(/needs up to 5 requests but only 4 of 10 remain/);
    expect(q.preflight({ openrouter: 4 }).ok).toBe(true);

    q.recordFailure('openrouter', 'm', new ProviderError('daily', 'daily_quota', 429, now + 3_600_000));
    expect(q.preflight({ openrouter: 1 }).reason).toMatch(/paused/);
    expect(q.preflight({}).ok).toBe(true); // nothing needed from any provider
  });
});

describe('paid-provider lock (ALLOW_PAID_PROVIDERS=false)', () => {
  it('cannot be overridden by Settings or a stored settings file, and never contacts the paid provider', async () => {
    const dir = tmp();
    // A stale settings file that tries to enable paid usage must be ignored while locked.
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ allowPaid: true, judgeModel: 'anthropic:claude' }));
    const free = new RecordingProvider('openrouter', 'free', ['car1', 'judge'], { judge: () => ({ text: verdict(['A']) }) });
    const paid = new RecordingProvider('anthropic', 'paid', ['claude'], {});
    const { app, ready } = createApp({ dataDir: dir, providers: [free, paid], paidLocked: () => true });
    await ready;

    const settings = (await request(app).get('/api/settings')).body;
    expect(settings.allowPaid).toBe(false);
    expect(settings.paidLocked).toBe(true);

    const put = await request(app).put('/api/settings').send({ allowPaid: true });
    expect(put.status).toBe(403);
    expect(put.body.error).toMatch(/ALLOW_PAID_PROVIDERS=false/);
    expect((await request(app).get('/api/settings')).body.allowPaid).toBe(false);
    // Other settings can still be saved while locked.
    expect((await request(app).put('/api/settings').send({ maxTokens: 300 })).body).toMatchObject({ maxTokens: 300, allowPaid: false });

    const models = (await request(app).get('/api/models')).body.models.map((m: ModelInfo) => m.id);
    expect(models).not.toContain('anthropic:claude');
    expect((await request(app).post('/api/races').send({ prompt: 'x', models: ['anthropic:claude'] })).status).toBe(400);

    const prov = (await request(app).get('/api/providers')).body;
    expect(prov.env.paidLocked).toBe(true);
    expect(prov.providers.find((p: any) => p.id === 'anthropic')).toMatchObject({ locked: true, enabled: false });

    // Even a configured judgeModel pointing at the paid provider is not used.
    const { race } = await runRace(app, ['openrouter:car1']);
    expect(race.status).toBe('complete');
    expect(race.evaluation.judgeModel).toBe('openrouter:judge');

    expect(paid.listCalls).toBe(0);
    expect(paid.calls).toHaveLength(0);
  });

  it('is controlled only by the env flag (unlocked → the Settings toggle works)', async () => {
    const paid = new RecordingProvider('anthropic', 'paid', ['claude'], {});
    const { app } = createApp({ dataDir: tmp(), providers: [paid], paidLocked: () => false });
    const put = await request(app).put('/api/settings').send({ allowPaid: true });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ allowPaid: true, paidLocked: false });
  });
});

describe('missing-key guidance', () => {
  it('explains the root .env + restart fix on unavailable models and provider status', async () => {
    const unconfigured = new RecordingProvider('openrouter', 'free', ['car1'], {}, false);
    const { app } = createApp({ dataDir: tmp(), providers: [unconfigured] });
    const [m] = (await request(app).get('/api/models')).body.models;
    expect(m.available).toBe(false);
    expect(m.unavailableReason).toMatch(/OPENROUTER_API_KEY in the root \.env.*restart the server/);
    const prov = (await request(app).get('/api/providers')).body;
    expect(prov.env.restartHint).toMatch(/restart/);
    expect(typeof prov.env.envChangedSinceStart).toBe('boolean');
    expect(prov.providers[0]).toMatchObject({ configured: false, enabled: false });
  });
});

describe('race request budget', () => {
  it('preflight counts competitors plus at most two judge requests', async () => {
    const p = new RecordingProvider('openrouter', 'free', ['c1', 'c2', 'c3', 'j1', 'j2', 'j3'], {});
    const { app, quota, ready } = createApp({ dataDir: tmp(), providers: [p] });
    await ready;
    quota.setLimits('openrouter', { dailyLimit: 50, rpm: 20 });
    const plan = (await request(app).post('/api/races/preflight').send({ models: ['openrouter:c1', 'openrouter:c2', 'openrouter:c3'] })).body;
    expect(plan).toMatchObject({ competitorRequests: 3, judgeRequests: MAX_JUDGE_ATTEMPTS, needs: { openrouter: 5 } });
    expect(plan.judges.map((j: any) => j.id)).toEqual(['openrouter:j1', 'openrouter:j2']);
    expect(plan.preflight).toMatchObject({ ok: true, providers: { openrouter: { needed: 5, remainingToday: 50 } } });
    expect(p.calls).toHaveLength(0); // a dry run makes no requests
    expect((await request(app).post('/api/races/preflight').send({ models: [] })).status).toBe(400);
  });

  it('refuses to create a race the remaining daily quota cannot finish, before any request is made', async () => {
    const p = new RecordingProvider('openrouter', 'free', ['c1', 'c2', 'c3', 'j1', 'j2'], {});
    const { app, quota, ready } = createApp({ dataDir: tmp(), providers: [p] });
    await ready;
    quota.setLimits('openrouter', { dailyLimit: 4, rpm: 20 }); // 3 cars + 2 judges = 5 > 4
    const res = await request(app).post('/api/races').send({ prompt: 'x', models: ['openrouter:c1', 'openrouter:c2', 'openrouter:c3'] });
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/needs up to 5 requests but only 4 of 4 remain/);
    expect(p.calls).toHaveLength(0);
    // a smaller lineup fits: 2 cars + 2 judges = 4
    expect((await request(app).post('/api/races').send({ prompt: 'x', models: ['openrouter:c1', 'openrouter:c2'] })).status).toBe(201);
  });

  it('re-checks quota at start and red-flags the race without spending requests if it ran out meanwhile', async () => {
    const p = new RecordingProvider('openrouter', 'free', ['c1', 'j1'], {});
    const { app, quota, ready } = createApp({ dataDir: tmp(), providers: [p] });
    await ready;
    quota.setLimits('openrouter', { dailyLimit: 50, rpm: 20 });
    const created = await request(app).post('/api/races').send({ prompt: 'x', models: ['openrouter:c1'] });
    expect(created.status).toBe(201);
    quota.recordFailure('openrouter', 'openrouter:other', new ProviderError('daily', 'daily_quota', 429, Date.now() + 3_600_000));
    const started = await request(app).post(`/api/races/${created.body.id}/start`);
    expect(started.body.status).toBe('failed');
    const race = (await request(app).get(`/api/races/${created.body.id}`)).body;
    expect(race.events.at(-1)).toMatchObject({ type: 'race.failed' });
    expect(race.events.at(-1).data.error).toMatch(/paused/);
    expect(p.calls).toHaveLength(0);
  });
});

describe('judge limits', () => {
  it('makes at most two judge attempts, each capped at the reduced token limit', async () => {
    const fail: Behaviour = () => {
      throw new ProviderError('upstream broke', 'other', 500);
    };
    const p = new RecordingProvider('openrouter', 'free', ['car', 'j1', 'j2', 'j3', 'j4'], { j1: fail, j2: fail, j3: fail, j4: fail });
    const { app } = createApp({ dataDir: tmp(), providers: [p] });
    const { race } = await runRace(app, ['openrouter:car']);
    const judgeCalls = p.calls.filter((c) => c.model.startsWith('j'));
    expect(judgeCalls.map((c) => c.model)).toEqual(['j1', 'j2']);
    expect(judgeCalls.every((c) => c.maxTokens === JUDGE_MAX_TOKENS)).toBe(true);
    expect(JUDGE_MAX_TOKENS).toBeLessThan(4000);
    expect(race.status).toBe('complete');
    expect(race.evaluation.method).toBe('unavailable');
    expect(race.competitors[0].rank).toBe(1); // still ranked on speed + completion
  });

  it('stops judging when the free quota is exhausted instead of retrying into the limit', async () => {
    const p = new RecordingProvider('openrouter', 'free', ['car', 'j1', 'j2'], {
      j1: () => {
        throw new ProviderError('free-models-per-day exceeded', 'daily_quota', 429, Date.now() + 3_600_000);
      },
      j2: () => ({ text: verdict(['A']) }),
    });
    const { app } = createApp({ dataDir: tmp(), providers: [p] });
    const { race } = await runRace(app, ['openrouter:car']);
    expect(p.calls.map((c) => c.model)).toEqual(['car', 'j1']); // j2 never called
    expect(race.evaluation.method).toBe('unavailable');
    expect(race.evaluation.note).toMatch(/skipped/);
  });

  it('uses the fallback judge when the first one fails for a non-quota reason', async () => {
    const p = new RecordingProvider('openrouter', 'free', ['car', 'j1', 'j2'], {
      j1: () => ({ text: 'not json' }),
      j2: () => ({ text: verdict(['A']) }),
    });
    const { app } = createApp({ dataDir: tmp(), providers: [p] });
    const { race } = await runRace(app, ['openrouter:car']);
    expect(race.evaluation).toMatchObject({ method: 'llm-judge', judgeModel: 'openrouter:j2' });
  });
});
