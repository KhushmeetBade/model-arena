import { describe, expect, it } from 'vitest';
import { autoFillLineup, budgetLabel, resolveLineup, setupGuidance } from './lineup';
import type { ModelInfo, ProviderStatus, ProvidersResponse, RacePlan } from './types';

const model = (id: string, o: Partial<ModelInfo> = {}): ModelInfo => ({ id, provider: 'openrouter', providerModel: id, name: id.toUpperCase(), free: true, available: true, ...o });

const provider = (o: Partial<ProviderStatus> = {}, q: Partial<NonNullable<ProviderStatus['quota']>> = {}): ProviderStatus => ({
  id: 'openrouter', label: 'OpenRouter', billing: 'free', configured: true, keyEnvVar: 'OPENROUTER_API_KEY', enabled: true, modelCount: 3, availableCount: 3, listError: null,
  quota: { requestsToday: 0, successesToday: 0, failuresToday: 0, requestsLastMinute: 0, dailyLimit: 50, rpm: 20, blockedUntil: null, blockedReason: null, lastError: null, lastErrorAt: null, lastValidatedAt: 1, validation: 'ok', ...q },
  ...o,
});
const resp = (p: ProviderStatus, envChangedSinceStart = false): ProvidersResponse => ({
  env: { paidLocked: true, envChangedSinceStart, restartHint: 'restart' }, providers: [p], modelCooldowns: {}, nextDailyReset: 0,
});

describe('resolveLineup', () => {
  it('keeps unavailable and unlisted cars on the grid instead of dropping them', () => {
    const models = [model('a'), model('b', { available: false, unavailableReason: 'cooling down until 4:00' })];
    const r = resolveLineup(['a', 'b', 'gone'], models);
    expect(r.slots.map((s) => [s.id, s.state])).toEqual([['a', 'ready'], ['b', 'unavailable'], ['gone', 'unlisted']]);
    expect(r.ready).toEqual(['a']);
    expect(r.blocked.map((s) => s.id)).toEqual(['b', 'gone']);
    expect(r.slots[1].reason).toMatch(/cooling down/);
    expect(r.slots[2].reason).toMatch(/no longer in the model catalog/i);
  });

  it('does not lose the lineup while the catalog is not loaded yet', () => {
    expect(resolveLineup(['a', 'b'], []).slots).toHaveLength(2);
  });
});

describe('autoFillLineup', () => {
  it('fills only an empty lineup, with available free models', () => {
    const models = [model('paid', { free: false }), model('off', { available: false }), model('a'), model('b'), model('c'), model('d'), model('e')];
    expect(autoFillLineup([], models)).toEqual(['a', 'b', 'c', 'd']);
    expect(autoFillLineup(['off'], models)).toBeNull(); // never overwrites the user's picks
    expect(autoFillLineup([], [model('off', { available: false })])).toBeNull();
  });
});

describe('setupGuidance', () => {
  it('is silent when free racing is possible', () => {
    expect(setupGuidance(resp(provider()))).toBeNull();
    expect(setupGuidance(null)).toBeNull();
  });

  it('tells the user to restart when .env changed after the server started', () => {
    const g = setupGuidance(resp(provider(), true))!;
    expect(g.title).toMatch(/\.env changed/);
    expect(g.steps?.join(' ')).toMatch(/npm run dev/);
  });

  it('explains the missing key with the root .env path and restart', () => {
    const g = setupGuidance(resp(provider({ configured: false, enabled: false }, { validation: 'missing_key' })))!;
    expect(g.tone).toBe('red');
    expect(g.title).toMatch(/OPENROUTER_API_KEY is not loaded/);
    expect(g.body).toMatch(/model-arena\/\.env.*restart the server/);
  });

  it('flags a rejected key and an exhausted free quota without suggesting paid fallback', () => {
    expect(setupGuidance(resp(provider({}, { validation: 'invalid_key' })))!.title).toMatch(/rejected/);
    const q = setupGuidance(resp(provider({}, { blockedUntil: Date.now() + 3_600_000, blockedReason: 'daily_quota' })))!;
    expect(q.title).toMatch(/quota used up/);
    expect(q.body).toMatch(/No paid fallback/);
  });
});

describe('budgetLabel', () => {
  it('summarises cars + judge requests and remaining free quota', () => {
    const plan: RacePlan = {
      needs: { openrouter: 6 }, competitorRequests: 4, judgeRequests: 2, judges: [],
      preflight: { ok: true, reason: null, providers: { openrouter: { needed: 6, remainingToday: 44, dailyLimit: 50, remainingMinute: 20, rpm: 20 } } },
    };
    expect(budgetLabel(plan)).toBe('Uses up to 6 free requests (4 cars + 2 judge) · 44/50 free requests left today');
  });
});
