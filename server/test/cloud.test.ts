import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { BlobPreconditionFailedError } from '@vercel/blob';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { BlobApi, BlobPersistence, mergeRaces } from '../src/lib/persistence.js';
import { makeHostRules } from '../src/lib/security.js';
import { ModelInfo, Provider, StreamArgs } from '../src/types.js';

/** Test-only provider (mock data only). */
class Stub implements Provider {
  id = 'openrouter' as const;
  label = 'stub';
  billing = 'free' as const;
  keyEnvVar = 'OPENROUTER_API_KEY';
  calls = 0;
  isConfigured() {
    return true;
  }
  async listModels(): Promise<ModelInfo[]> {
    return ['a', 'b', 'judge'].map((n) => ({ id: `openrouter:${n}`, provider: 'openrouter', providerModel: n, name: n.toUpperCase(), free: true, available: true }));
  }
  async stream(a: StreamArgs) {
    this.calls++;
    if (a.model === 'judge')
      return { text: JSON.stringify({ scores: { A: { accuracy: 8, helpfulness: 8, clarity: 8, completeness: 8, comment: 'ok' }, B: { accuracy: 6, helpfulness: 6, clarity: 6, completeness: 6, comment: 'meh' } }, summary: 's' }) };
    a.onDelta(`hello from ${a.model}`);
    return { text: `hello from ${a.model}`, outputTokens: 3 };
  }
}

/** In-memory fake of the Vercel Blob get/put API with ETag semantics. */
function fakeBlob() {
  const files = new Map<string, { body: string; etag: string }>();
  let n = 0;
  const api = {
    get: (async (pathname: string, o: { ifNoneMatch?: string }) => {
      const f = files.get(pathname);
      if (!f) return null;
      if (o.ifNoneMatch && o.ifNoneMatch === f.etag) return { statusCode: 304, stream: null, blob: { etag: f.etag } };
      return { statusCode: 200, stream: new Blob([f.body]).stream(), blob: { etag: f.etag } };
    }) as unknown as BlobApi['get'],
    put: (async (pathname: string, body: string, o: { ifMatch?: string }) => {
      const f = files.get(pathname);
      if (f && o.ifMatch && o.ifMatch !== f.etag) throw new BlobPreconditionFailedError();
      const etag = `"e${++n}"`;
      files.set(pathname, { body, etag });
      return { etag, pathname };
    }) as unknown as BlobApi['put'],
  };
  return { api, files };
}

const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-cloud-'));
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const sseTypes = (body: string) => [...body.matchAll(/^event: (.+)$/gm)].map((m) => m[1]);
const run = (app: Parameters<typeof request>[0], models: string[], code?: string) => {
  const r = request(app).post('/api/races/run');
  if (code) r.set('x-arena-access', code);
  return r
    .send({ prompt: 'Same prompt for everyone', models })
    .buffer(true)
    .parse((res, cb) => {
      let d = '';
      res.on('data', (c: Buffer) => (d += c));
      res.on('end', () => cb(null, d));
    });
};

describe('one-request streamed race (/api/races/run)', () => {
  it('streams the whole race, then saves it for Replays and Champions', async () => {
    const { app } = createApp({ dataDir: tmp(), providers: [new Stub()] });
    const res = await run(app, ['openrouter:a', 'openrouter:b']);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const types = sseTypes(res.body as string);
    expect(types[0]).toBe('race.created');
    expect(types).toEqual(expect.arrayContaining(['race.start', 'car.first_token', 'car.finish', 'judge.done', 'race.complete', 'saved', 'end']));
    const saved = JSON.parse((res.body as string).match(/event: saved\ndata: (\{.*\})/)![1]).id as string;
    const race = (await request(app).get(`/api/races/${saved}`)).body;
    expect(race.status).toBe('complete');
    expect(race.evaluation.method).toBe('llm-judge');
    expect((await request(app).get('/api/leaderboard')).body.rows).toHaveLength(2);
  });

  it('rejects invalid input with JSON errors before streaming', async () => {
    const { app } = createApp({ dataDir: tmp(), providers: [new Stub()] });
    const empty = await request(app).post('/api/races/run').send({ prompt: '   ', models: ['openrouter:a'] });
    expect(empty.status).toBe(400);
    expect(empty.body.error).toMatch(/Prompt is required/);
    expect((await request(app).post('/api/races/run').send({ prompt: 'x'.repeat(8001), models: ['openrouter:a'] })).body.error).toMatch(/too long/);
    expect((await request(app).post('/api/races/run').send({ prompt: 'x', models: ['openrouter:nope'] })).body.error).toMatch(/Unknown model/);
  });
});

describe('owner access code (public deployment)', () => {
  const stub = new Stub();
  const { app } = createApp({ dataDir: tmp(), providers: [stub], accessCode: () => 'correct-horse-battery', maxLiveRacesPerDay: 1 });

  it('blocks races and settings changes without the code, and never calls a model', async () => {
    expect((await request(app).get('/api/access')).body).toEqual({ required: true });
    const r = await request(app).post('/api/races/run').send({ prompt: 'x', models: ['openrouter:a'] });
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('access_required');
    expect((await request(app).put('/api/settings').send({ maxTokens: 64 })).status).toBe(401);
    expect((await request(app).put('/api/liveries').send({ modelId: 'openrouter:a', number: 3 })).status).toBe(401);
    expect((await request(app).post('/api/providers/revalidate')).status).toBe(401);
    expect((await request(app).post('/api/races/run').set('x-arena-access', 'wrong').send({ prompt: 'x', models: ['openrouter:a'] })).status).toBe(401);
    expect(stub.calls).toBe(0);
    // reading (demos, replays, leaderboard) stays open to everyone
    expect((await request(app).get('/api/demo/races')).status).toBe(200);
    expect((await request(app).get('/api/races')).status).toBe(200);
  });

  it('accepts the right code and enforces the daily live-race cap', async () => {
    expect((await request(app).post('/api/access/verify').set('x-arena-access', 'correct-horse-battery')).status).toBe(200);
    expect((await run(app, ['openrouter:a'], 'correct-horse-battery')).status).toBe(200);
    const second = await request(app).post('/api/races/run').set('x-arena-access', 'correct-horse-battery').send({ prompt: 'x', models: ['openrouter:a'] });
    expect(second.status).toBe(429);
    expect(second.body.error).toMatch(/daily limit of 1 live AI races/);
  });

  it('rate-limits repeated wrong codes per client', async () => {
    const { app: a2 } = createApp({ dataDir: tmp(), providers: [new Stub()], accessCode: () => 'secret-code' });
    let last = 0;
    for (let i = 0; i < 10; i++) last = (await request(a2).post('/api/access/verify').set('x-arena-access', `guess${i}`)).status;
    expect(last).toBe(429);
  });
});

describe('deployment host rules', () => {
  it('allows only the deployment hostnames and https same-origin requests', () => {
    const r = makeHostRules(['model-arena.vercel.app']);
    expect(r.isAllowedHost('model-arena.vercel.app')).toBe(true);
    expect(r.isAllowedHost('localhost:8787')).toBe(true);
    expect(r.isAllowedHost('evil.example')).toBe(false);
    expect(r.isAllowedOrigin('https://model-arena.vercel.app')).toBe(true);
    expect(r.isAllowedOrigin('http://model-arena.vercel.app')).toBe(false);
    expect(r.isAllowedOrigin('https://model-arena.vercel.app.evil.example')).toBe(false);
  });
});

describe('Vercel Blob persistence', () => {
  it('keeps races, quota and liveries across serverless instances', async () => {
    const blob = fakeBlob();
    const one = createApp({ providers: [new Stub()], persistence: new BlobPersistence({ api: blob.api, ttlMs: 0, merge: { 'races.json': mergeRaces } }), serverless: true });
    await one.ready;
    expect((await run(one.app, ['openrouter:a', 'openrouter:b'])).status).toBe(200);
    await request(one.app).put('/api/liveries').send({ modelId: 'openrouter:a', nickname: 'Comet' }).expect(200);

    // a brand-new instance (cold start) sees everything the first one saved
    const two = createApp({ providers: [new Stub()], persistence: new BlobPersistence({ api: blob.api, ttlMs: 0, merge: { 'races.json': mergeRaces } }), serverless: true });
    await two.ready;
    expect((await request(two.app).get('/api/races')).body.races).toHaveLength(1);
    expect((await request(two.app).get('/api/leaderboard')).body.rows).toHaveLength(2);
    expect((await request(two.app).get('/api/liveries')).body.liveries['openrouter:a'].nickname).toBe('Comet');
    const quota = (await request(two.app).get('/api/providers')).body.providers[0].quota;
    expect(quota.requestsToday).toBe(3); // 2 cars + 1 judge, counted across instances
  });

  it('merges concurrent race writes from two instances instead of losing one', async () => {
    const blob = fakeBlob();
    const a = new BlobPersistence({ api: blob.api, ttlMs: 0, merge: { 'races.json': mergeRaces } });
    const b = new BlobPersistence({ api: blob.api, ttlMs: 0, merge: { 'races.json': mergeRaces } });
    await a.refresh(true);
    await b.refresh(true);
    a.store<{ id: string; createdAt: number }[]>('races.json', () => []).write([{ id: 'r1', createdAt: 1 }]);
    await a.flush();
    b.store<{ id: string; createdAt: number }[]>('races.json', () => []).write([{ id: 'r2', createdAt: 2 }]); // stale etag
    await b.flush();
    const doc = JSON.parse(blob.files.get('model-arena/state.json')!.body);
    expect(doc['races.json'].map((r: { id: string }) => r.id).sort()).toEqual(['r1', 'r2']);
  });

  it('reports cloud deployment and blob storage in health', async () => {
    const { app } = createApp({ providers: [new Stub()], persistence: new BlobPersistence({ api: fakeBlob().api, ttlMs: 0 }), serverless: true });
    expect((await request(app).get('/api/health')).body).toMatchObject({ deployment: 'cloud', storage: 'blob' });
  });
});
