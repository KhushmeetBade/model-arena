import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ModelInfo, Provider, ProviderError, StreamArgs } from '../src/types.js';

/**
 * Test-only stub provider. It is never registered by the real server; it exists so the
 * race pipeline (concurrency, SSE, judging, scoring, persistence) can be verified offline.
 */
class StubProvider implements Provider {
  id = 'openrouter' as const;
  label = 'stub';
  billing = 'free' as const;
  keyEnvVar = 'STUB';
  isConfigured() { return true; }
  async listModels(): Promise<ModelInfo[]> {
    return ['fast', 'slow', 'broken', 'judge'].map((n) => ({ id: `openrouter:${n}`, provider: 'openrouter', providerModel: n, name: n.toUpperCase(), free: true, available: true }));
  }
  async stream(a: StreamArgs) {
    if (a.model === 'broken') throw new ProviderError('rate limited', 'rate_limit', 429, Date.now() + 60_000);
    if (a.model === 'judge') {
      const text = '{"scores":{"A":{"accuracy":9,"helpfulness":9,"clarity":9,"completeness":9,"comment":"great"},"B":{"accuracy":5,"helpfulness":5,"clarity":5,"completeness":5,"comment":"meh"}},"summary":"A better"}';
      return { text };
    }
    const words = a.model === 'fast' ? ['Paris ', 'is ', 'the ', 'capital.'] : ['It ', 'is ', 'Paris.'];
    const delay = a.model === 'fast' ? 10 : 60;
    let text = '';
    for (const w of words) {
      await new Promise((r) => setTimeout(r, delay));
      text += w;
      a.onDelta(w);
    }
    return { text, outputTokens: words.length };
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('race pipeline', () => {
  const { app } = createApp({ dataDir: dir, providers: [new StubProvider()] });

  it('lists models', async () => {
    const res = await request(app).get('/api/models');
    expect(res.status).toBe(200);
    expect(res.body.models).toHaveLength(4);
  });

  it('validates input', async () => {
    expect((await request(app).post('/api/races').send({ prompt: '', models: ['openrouter:fast'] })).status).toBe(400);
    expect((await request(app).post('/api/races').send({ prompt: 'x', models: [] })).status).toBe(400);
    const six = Array.from({ length: 6 }, (_, i) => `m${i}`);
    expect((await request(app).post('/api/races').send({ prompt: 'x', models: six })).status).toBe(400);
  });

  it('runs a full race over SSE: concurrent streams, DNF, judge, scoring, champion, history', async () => {
    const created = await request(app).post('/api/races').send({ prompt: 'Capital of France?', models: ['openrouter:slow', 'openrouter:fast', 'openrouter:broken'] });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const streamP = request(app)
      .get(`/api/races/${id}/stream`)
      .buffer(true)
      .parse((res, cb) => {
        let data = '';
        res.on('data', (c: Buffer) => (data += c.toString()));
        res.on('end', () => cb(null, data));
      });
    await new Promise((r) => setTimeout(r, 50));
    await request(app).post(`/api/races/${id}/start`).expect(200);
    const sse = (await streamP).body as string;

    const types = [...sse.matchAll(/^event: (.+)$/gm)].map((m) => m[1]);
    expect(types[0]).toBe('race.created');
    expect(types).toContain('race.start');
    expect(types).toContain('car.first_token');
    expect(types).toContain('car.progress');
    expect(types.filter((t) => t === 'car.finish')).toHaveLength(2);
    expect(types).toContain('car.dnf');
    expect(types).toContain('judge.done');
    expect(types.at(-2)).toBe('race.complete');

    const race = (await request(app).get(`/api/races/${id}`)).body;
    expect(race.status).toBe('complete');
    const fast = race.competitors.find((c: any) => c.modelId === 'openrouter:fast');
    const slow = race.competitors.find((c: any) => c.modelId === 'openrouter:slow');
    const broken = race.competitors.find((c: any) => c.modelId === 'openrouter:broken');
    expect(fast.text).toBe('Paris is the capital.');
    expect(fast.latencyMs).toBeLessThan(slow.latencyMs);
    expect(broken.status).toBe('dnf');
    expect(race.evaluation.method).toBe('llm-judge');
    expect(race.evaluation.judgeModel).toBe('openrouter:judge');
    // Judge saw answers in finish-independent lane order: slow=A (lane 0), fast=B (lane 1)
    expect(slow.judge.accuracy).toBe(9);
    expect(race.championId).toBe('openrouter:slow');
    expect(slow.rank).toBe(1);

    const finishEvents = race.events.filter((e: any) => e.type === 'car.finish');
    expect(finishEvents[0].data.lane).toBe(fast.lane);
    expect(finishEvents[0].data.position).toBe(1);

    // replay of a finished race returns the recorded events then ends
    const replay = await request(app).get(`/api/races/${id}/stream`).buffer(true).parse((res, cb) => { let d = ''; res.on('data', (c: Buffer) => (d += c)); res.on('end', () => cb(null, d)); });
    expect((replay.body as string).match(/event: race\.complete/)).toBeTruthy();

    const board = (await request(app).get('/api/leaderboard')).body.rows;
    expect(board[0].modelId).toBe('openrouter:slow');
    expect(board[0].wins).toBe(1);

    // the rate-limited model is now cooling down and unavailable
    const models = (await request(app).get('/api/models')).body.models;
    expect(models.find((m: any) => m.id === 'openrouter:broken').available).toBe(false);
    expect(fs.existsSync(path.join(dir, 'races.json'))).toBe(true);
  });
});
