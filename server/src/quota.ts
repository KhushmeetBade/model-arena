import type { SyncStore } from './lib/persistence.js';
import { nextUtcMidnight } from './providers/openrouter.js';
import { ProviderError, ProviderId } from './types.js';

interface ProviderQuota {
  dayKey: string;
  requestsToday: number;
  successesToday: number;
  failuresToday: number;
  /** Daily request cap if known (e.g. OpenRouter free tier: 50, or 1000 with ≥$10 credits purchased). */
  dailyLimit: number | null;
  /** Requests per minute cap if known. */
  rpm: number | null;
  /** Provider-wide block (auth failure, daily quota hit). */
  blockedUntil: number | null;
  blockedReason: string | null;
  lastError: string | null;
  lastErrorAt: number | null;
  lastValidatedAt: number | null;
  validation: 'unknown' | 'ok' | 'missing_key' | 'invalid_key' | 'error';
  keyNote?: string;
}

interface QuotaState {
  providers: Record<string, ProviderQuota>;
  /** Per-model cooldown (e.g. upstream 429 on a single free model). */
  models: Record<string, { until: number; reason: string }>;
}

const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

const fresh = (): ProviderQuota => ({
  dayKey: dayKey(),
  requestsToday: 0,
  successesToday: 0,
  failuresToday: 0,
  dailyLimit: null,
  rpm: null,
  blockedUntil: null,
  blockedReason: null,
  lastError: null,
  lastErrorAt: null,
  lastValidatedAt: null,
  validation: 'unknown',
});

export interface PreflightResult {
  ok: boolean;
  reason: string | null;
  providers: Partial<
    Record<ProviderId, { needed: number; remainingToday: number | null; dailyLimit: number | null; remainingMinute: number | null; rpm: number | null }>
  >;
}

export type Revalidator =(provider: ProviderId) => Promise<void>;

/**
 * Tracks provider usage locally (counts only requests this app makes), honors
 * provider-reported limits, and schedules automatic revalidation when a known
 * reset time (rate-limit window or 00:00 UTC daily reset) passes.
 */
export class QuotaManager {
  private state: QuotaState;
  private minuteWindow = new Map<string, number[]>();
  private timer: NodeJS.Timeout | null = null;
  private revalidator: Revalidator | null = null;

  constructor(private store: SyncStore<QuotaState> | null, private now: () => number = Date.now) {
    this.state = store?.read() ?? { providers: {}, models: {} };
    this.state.providers ??= {};
    this.state.models ??= {};
  }

  /** Re-read persisted counters (e.g. after another serverless instance updated them). */
  reload() {
    if (!this.store) return;
    this.state = this.store.read() ?? { providers: {}, models: {} };
    this.state.providers ??= {};
    this.state.models ??= {};
  }

  setRevalidator(fn: Revalidator) {
    this.revalidator = fn;
    this.schedule();
  }

  private save() {
    this.store?.write(this.state);
  }

  get(provider: ProviderId): ProviderQuota {
    let q = this.state.providers[provider];
    if (!q) q = this.state.providers[provider] = fresh();
    if (q.dayKey !== dayKey(this.now())) {
      // Daily rollover (UTC) — counters reset.
      Object.assign(q, { dayKey: dayKey(this.now()), requestsToday: 0, successesToday: 0, failuresToday: 0 });
      if (q.blockedReason === 'daily_quota') {
        q.blockedUntil = null;
        q.blockedReason = null;
      }
    }
    if (q.blockedUntil && q.blockedUntil <= this.now()) {
      q.blockedUntil = null;
      q.blockedReason = null;
    }
    return q;
  }

  setLimits(provider: ProviderId, limits: { dailyLimit?: number | null; rpm?: number | null; keyNote?: string }) {
    const q = this.get(provider);
    if (limits.dailyLimit !== undefined) q.dailyLimit = limits.dailyLimit;
    if (limits.rpm !== undefined) q.rpm = limits.rpm;
    if (limits.keyNote !== undefined) q.keyNote = limits.keyNote;
    this.save();
  }

  setValidation(provider: ProviderId, validation: ProviderQuota['validation'], error?: string) {
    const q = this.get(provider);
    q.validation = validation;
    q.lastValidatedAt = this.now();
    if (validation === 'ok') {
      // A successful check supersedes any earlier failure message.
      q.lastError = null;
      q.lastErrorAt = null;
      if (q.blockedReason === 'auth') {
        q.blockedUntil = null;
        q.blockedReason = null;
      }
    }
    if (error) {
      q.lastError = error;
      q.lastErrorAt = this.now();
    }
    this.save();
  }

  modelCooldown(modelId: string): { until: number; reason: string } | null {
    const c = this.state.models[modelId];
    if (!c) return null;
    if (c.until <= this.now()) {
      delete this.state.models[modelId];
      this.save();
      return null;
    }
    return c;
  }

  /** Returns null if a request may be made, or a human-readable reason why not. */
  check(provider: ProviderId, modelId: string, requests = 1): string | null {
    const q = this.get(provider);
    if (q.blockedUntil) return `${provider} paused until ${new Date(q.blockedUntil).toISOString()} (${q.blockedReason})`;
    const mc = this.modelCooldown(modelId);
    if (mc) return `cooling down until ${new Date(mc.until).toLocaleTimeString()} (${mc.reason})`;
    if (q.dailyLimit != null && q.requestsToday + requests > q.dailyLimit)
      return `daily limit reached (${q.requestsToday}/${q.dailyLimit}); resets 00:00 UTC`;
    if (q.rpm != null) {
      const recent = this.recent(provider);
      if (recent.length + requests > q.rpm) return `per-minute limit reached (${q.rpm}/min)`;
    }
    return null;
  }

  /**
   * Whole-race budget check. `needs` is the worst-case number of requests the race will make
   * per provider (all competitors + every judge attempt). Read-only: never records usage.
   * A race is refused up front rather than allowed to run out of quota midway.
   */
  preflight(needs: Partial<Record<ProviderId, number>>): PreflightResult {
    const providers: PreflightResult['providers'] = {};
    let reason: string | null = null;
    for (const [id, needed] of Object.entries(needs) as [ProviderId, number][]) {
      if (!needed) continue;
      const q = this.get(id);
      const usedMinute = this.recent(id).length;
      const remainingToday = q.dailyLimit == null ? null : Math.max(0, q.dailyLimit - q.requestsToday);
      const remainingMinute = q.rpm == null ? null : Math.max(0, q.rpm - usedMinute);
      providers[id] = { needed, remainingToday, dailyLimit: q.dailyLimit, remainingMinute, rpm: q.rpm };
      if (reason) continue;
      if (q.blockedUntil) reason = `${id} is paused until ${new Date(q.blockedUntil).toISOString()} (${q.blockedReason})`;
      else if (remainingToday != null && needed > remainingToday)
        reason = `Not enough free ${id} quota today: this race needs up to ${needed} requests but only ${remainingToday} of ${q.dailyLimit} remain (resets 00:00 UTC). Use fewer cars or wait for the reset.`;
      else if (remainingMinute != null && needed > remainingMinute)
        reason = `Per-minute limit: this race needs up to ${needed} requests but only ${remainingMinute} of ${q.rpm}/min are free right now. Wait a minute and try again.`;
    }
    return { ok: !reason, reason, providers };
  }

  private recent(provider: string) {
    const cutoff = this.now() - 60_000;
    const arr = (this.minuteWindow.get(provider) ?? []).filter((t) => t > cutoff);
    this.minuteWindow.set(provider, arr);
    return arr;
  }

  recordRequest(provider: ProviderId) {
    const q = this.get(provider);
    q.requestsToday++;
    this.recent(provider).push(this.now());
    this.save();
  }

  recordSuccess(provider: ProviderId) {
    this.get(provider).successesToday++;
    this.save();
  }

  recordFailure(provider: ProviderId, modelId: string, err: unknown) {
    const q = this.get(provider);
    q.failuresToday++;
    const message = err instanceof Error ? err.message : String(err);
    q.lastError = message;
    q.lastErrorAt = this.now();
    if (err instanceof ProviderError) {
      if (err.kind === 'rate_limit') {
        this.state.models[modelId] = { until: err.resetAt ?? this.now() + 60_000, reason: 'rate limited' };
      } else if (err.kind === 'daily_quota') {
        q.blockedUntil = err.resetAt ?? nextUtcMidnight(this.now());
        q.blockedReason = 'daily_quota';
      } else if (err.kind === 'auth') {
        q.validation = 'invalid_key';
        q.blockedUntil = this.now() + 10 * 60_000;
        q.blockedReason = 'auth';
      } else if (err.kind === 'unavailable') {
        this.state.models[modelId] = { until: this.now() + 5 * 60_000, reason: 'upstream unavailable' };
      }
    }
    this.save();
    this.schedule();
  }

  /** Schedule a revalidation at the earliest known reset time (and at next UTC midnight). */
  schedule() {
    if (this.timer) clearTimeout(this.timer);
    const times = [nextUtcMidnight(this.now())];
    for (const q of Object.values(this.state.providers)) if (q.blockedUntil) times.push(q.blockedUntil);
    for (const m of Object.values(this.state.models)) times.push(m.until);
    const next = Math.min(...times);
    const delay = Math.max(1_000, Math.min(next - this.now() + 1_000, 2 ** 31 - 1));
    this.timer = setTimeout(() => void this.fire(), delay);
    this.timer.unref?.();
  }

  private async fire() {
    const due: ProviderId[] = [];
    for (const [id, q] of Object.entries(this.state.providers)) {
      const before = q.blockedUntil;
      this.get(id as ProviderId); // clears expired blocks / rolls the day
      if (before || q.validation !== 'ok') due.push(id as ProviderId);
    }
    for (const id of Object.keys(this.state.models)) this.modelCooldown(id);
    this.save();
    if (this.revalidator) for (const p of due) await this.revalidator(p).catch(() => undefined);
    this.schedule();
  }

  snapshot() {
    const providers: Record<string, ProviderQuota & { requestsLastMinute: number }> = {};
    for (const id of Object.keys(this.state.providers)) {
      providers[id] = { ...this.get(id as ProviderId), requestsLastMinute: this.recent(id).length };
    }
    const models = Object.fromEntries(
      Object.entries(this.state.models).filter(([, v]) => v.until > this.now()),
    );
    return { providers, models, nextDailyReset: nextUtcMidnight(this.now()) };
  }
}
