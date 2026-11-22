import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { demoRaces } from '../src/demo.js';
import { scoreCompetitors } from '../src/scoring.js';
import { ModelInfo, Provider, StreamArgs } from '../src/types.js';

/** Test-only provider that records any call — the demo races must never cause one. */
class Recorder implements Provider {
  id = 'openrouter' as const;
  label = 'recorder';
  billing = 'free' as const;
  keyEnvVar = 'OPENROUTER_API_KEY';
  calls = 0;
  isConfigured() {
    return true;
  }
  async listModels(): Promise<ModelInfo[]> {
    return [{ id: 'openrouter:a', provider: 'openrouter', providerModel: 'a', name: 'A', free: true, available: true }];
  }
  async stream(_a: StreamArgs) {
    this.calls++;
    return { text: 'x' };
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-demo-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('demo races (simulated)', () => {
  const races = demoRaces();

  it('provides the three scenarios with honest durations', () => {
    expect(races.map((r) => r.id)).toEqual(['demo-quick-sprint', 'demo-one-minute', 'demo-championship']);
    const secs = races.map((r) => r.events.at(-1)!.t / 1000);
    expect(secs[0]).toBeGreaterThan(6);
    expect(secs[0]).toBeLessThan(15);
    expect(secs[1]).toBeGreaterThanOrEqual(55); // "One-Minute Championship" really is about a minute
    expect(secs[1]).toBeLessThanOrEqual(65);
    expect(secs[2]).toBeGreaterThan(15);
    expect(secs[2]).toBeLessThan(40);
    expect(races.map((r) => r.competitors.length)).toEqual([3, 4, 5]);
  });

  it('is unmistakably labelled as simulated and never credits a real model', () => {
    for (const r of races) {
      expect(r.demo?.title).toBeTruthy();
      expect(r.evaluation?.note).toMatch(/DEMO RACE — SIMULATED RESULTS/);
      for (const c of r.competitors) {
        expect(c.provider).toBe('demo');
        expect(c.modelId).toMatch(/^demo:/);
        expect(c.name).toMatch(/^Simulated: /);
      }
    }
  });

  it('has a complete, time-ordered event timeline ending in the podium', () => {
    for (const r of races) {
      const t = r.events.map((e) => e.t);
      expect(t).toEqual([...t].sort((a, b) => a - b));
      expect(r.events[0].type).toBe('race.created');
      expect(r.events.at(-1)!.type).toBe('race.complete');
      expect(r.events.filter((e) => e.type === 'car.progress').length).toBeGreaterThan(20);
      expect(r.events.some((e) => e.type === 'judge.start')).toBe(true);
    }
    const minute = races[1];
    expect(minute.events.some((e) => e.type === 'car.dnf')).toBe(true);
    // a reasoning racer thinks before answering
    expect(minute.events.some((e) => e.type === 'car.progress' && e.data.phase === 'thinking')).toBe(true);
  });

  it('uses the real scoring function, so podiums follow the same rules as live races', () => {
    for (const r of races) {
      const rescored = scoreCompetitors(r.competitors.map((c) => ({ ...c, scores: undefined, rank: undefined })), r.weights);
      expect(rescored.map((c) => [c.modelId, c.rank, c.scores?.total])).toEqual(r.competitors.map((c) => [c.modelId, c.rank, c.scores?.total]));
      const champ = r.competitors.find((c) => c.modelId === r.championId)!;
      expect(champ.status).toBe('finished');
      expect(champ.rank).toBe(1);
    }
    const dnf = races[1].competitors.find((c) => c.status === 'dnf')!;
    expect(dnf.scores?.total).toBe(0); // failed responses are never rewarded
  });
});

describe('demo isolation from genuine results', () => {
  const rec = new Recorder();
  const { app } = createApp({ dataDir: dir, providers: [rec] });

  it('serves demos on their own read-only routes without calling any model', async () => {
    const list = (await request(app).get('/api/demo/races')).body.races;
    expect(list).toHaveLength(3);
    expect(list[1]).toMatchObject({ id: 'demo-one-minute', demo: { title: 'One-Minute Championship' } });
    expect(list[1].durationMs).toBeGreaterThan(55_000);
    const one = (await request(app).get('/api/demo/races/demo-championship')).body;
    expect(one.events.length).toBeGreaterThan(50);
    expect((await request(app).get('/api/demo/races/nope')).status).toBe(404);
    expect(rec.calls).toBe(0);
  });

  it('never appears in real race history, replays, leaderboard or storage', async () => {
    await request(app).get('/api/demo/races');
    expect((await request(app).get('/api/races')).body.races).toEqual([]);
    expect((await request(app).get('/api/leaderboard')).body.rows).toEqual([]);
    expect((await request(app).get('/api/races/demo-one-minute')).status).toBe(404);
    expect(fs.existsSync(path.join(dir, 'races.json'))).toBe(false);
  });
});
