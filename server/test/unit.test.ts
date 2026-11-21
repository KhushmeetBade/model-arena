import { describe, expect, it } from 'vitest';
import { parseJudgeResponse, buildJudgePrompt } from '../src/judge.js';
import { scoreCompetitors } from '../src/scoring.js';
import { QuotaManager } from '../src/quota.js';
import { parseSse } from '../src/lib/sse.js';
import { ProviderError, CompetitorResult } from '../src/types.js';
import { nextUtcMidnight } from '../src/providers/openrouter.js';

const base = (o: Partial<CompetitorResult>): CompetitorResult => ({
  modelId: 'm', name: 'm', provider: 'openrouter', lane: 0, status: 'finished', text: 'hi', reasoningChars: 0, tokensEstimated: false, ...o,
});
const W = { quality: 65, speed: 25, completion: 10 };

describe('scoring', () => {
  it('ranks by weighted quality+speed and gives DNF zero', () => {
    const out = scoreCompetitors([
      base({ modelId: 'fast', lane: 0, latencyMs: 1000, judge: { accuracy: 6, helpfulness: 6, clarity: 6, completeness: 6, comment: '' } }),
      base({ modelId: 'good', lane: 1, latencyMs: 2000, judge: { accuracy: 10, helpfulness: 10, clarity: 9, completeness: 9, comment: '' } }),
      base({ modelId: 'dead', lane: 2, status: 'dnf', text: '' }),
    ], W);
    const by = Object.fromEntries(out.map((c) => [c.modelId, c]));
    expect(by.fast.scores!.speed).toBe(100);
    expect(by.good.scores!.speed).toBe(50);
    expect(by.good.scores!.quality).toBe(95);
    // fast: .65*60+.25*100+.1*100 = 74 ; good: .65*95+.25*50+.1*100 = 84.25
    expect(by.fast.scores!.total).toBe(74);
    expect(by.good.scores!.total).toBe(84.3);
    expect(by.good.rank).toBe(1);
    expect(by.dead.scores!.total).toBe(0);
    expect(by.dead.rank).toBe(3);
  });

  it('drops quality weight when no judge verdict exists', () => {
    const out = scoreCompetitors([base({ modelId: 'a', latencyMs: 500 }), base({ modelId: 'b', lane: 1, latencyMs: 1000 })], W);
    expect(out[0].scores!.quality).toBeNull();
    expect(out[0].scores!.total).toBe(100);
    expect(out[1].scores!.total).toBeCloseTo((25 * 50 + 10 * 100) / 35, 1);
  });
});

describe('judge parsing', () => {
  it('parses fenced JSON with think tags and clamps', () => {
    const raw = '<think>hmm {not json}</think>```json\n{"scores":{"A":{"accuracy":11,"helpfulness":8,"clarity":"7","completeness":6,"comment":"ok"},"B":{"accuracy":3,"helpfulness":4,"clarity":5,"completeness":2,"comment":"weak"}},"summary":"A wins"}\n```';
    const r = parseJudgeResponse(raw, ['A', 'B']);
    expect(r.scores.A.accuracy).toBe(10);
    expect(r.scores.A.clarity).toBe(7);
    expect(r.scores.B.completeness).toBe(2);
    expect(r.summary).toBe('A wins');
  });
  it('rejects a verdict missing an answer', () => {
    expect(() => parseJudgeResponse('{"scores":{"A":{"accuracy":1,"helpfulness":1,"clarity":1,"completeness":1}}}', ['A', 'B'])).toThrow(/omitted/);
  });
  it('builds an anonymized prompt', () => {
    const p = buildJudgePrompt('Q?', [{ label: 'A', text: 'x' }, { label: 'B', text: 'y' }]);
    expect(p).toContain('<answer id="A">');
    expect(p).toContain('"B":{');
  });
});

describe('quota manager', () => {
  it('enforces daily and per-minute caps and cools down rate-limited models', () => {
    let now = Date.UTC(2026, 0, 1, 12);
    const q = new QuotaManager(null, () => now);
    q.setLimits('openrouter', { dailyLimit: 3, rpm: 2 });
    expect(q.check('openrouter', 'm1')).toBeNull();
    q.recordRequest('openrouter');
    q.recordRequest('openrouter');
    expect(q.check('openrouter', 'm1')).toMatch(/per-minute/);
    now += 61_000;
    expect(q.check('openrouter', 'm1')).toBeNull();
    q.recordRequest('openrouter');
    expect(q.check('openrouter', 'm1')).toMatch(/daily limit/);
    now = Date.UTC(2026, 0, 2, 0, 0, 5); // UTC rollover
    expect(q.check('openrouter', 'm1')).toBeNull();

    q.recordFailure('openrouter', 'm1', new ProviderError('429', 'rate_limit', 429, now + 30_000));
    expect(q.check('openrouter', 'm1')).toMatch(/cooling down/);
    expect(q.check('openrouter', 'm2')).toBeNull();
    now += 31_000;
    expect(q.check('openrouter', 'm1')).toBeNull();

    q.recordFailure('openrouter', 'm1', new ProviderError('daily', 'daily_quota', 429, nextUtcMidnight(now)));
    expect(q.check('openrouter', 'm2')).toMatch(/paused/);
    now = nextUtcMidnight(now) + 1;
    expect(q.check('openrouter', 'm2')).toBeNull();
  });
});

describe('sse parser', () => {
  it('handles split chunks, comments and [DONE]', async () => {
    const parts = [': OPENROUTER PROCESSING\n\n', 'data: {"a":', '1}\n\ndata: {"a":2}\r\n\r\n', 'data: [DONE]\n\n', 'data: {"a":3}\n\n'];
    const body = new ReadableStream<Uint8Array>({
      start(c) { for (const p of parts) c.enqueue(new TextEncoder().encode(p)); c.close(); },
    });
    const got: unknown[] = [];
    for await (const ev of parseSse(body)) got.push(ev.data);
    expect(got).toEqual([{ a: 1 }, { a: 2 }]);
  });
});
