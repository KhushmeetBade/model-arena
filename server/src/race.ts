import { randomUUID } from 'node:crypto';
import { Catalog } from './catalog.js';
import { buildJudgePrompt, JUDGE_SYSTEM, parseJudgeResponse } from './judge.js';
import { JsonStore } from './lib/store.js';
import { PreflightResult, QuotaManager } from './quota.js';
import { scoreCompetitors } from './scoring.js';
import { CompetitorResult, Evaluation, ModelInfo, ProviderError, ProviderId, RaceEvent, RaceRecord, Settings } from './types.js';

type Listener = (ev: RaceEvent) => void;
const PROGRESS_INTERVAL_MS = 120;
const MAX_HISTORY = 200;
/** Races created but never started are dropped after this long. */
export const ABANDON_MS = 2 * 60_000;
/** At most this many judge requests per race (primary + one fallback). */
export const MAX_JUDGE_ATTEMPTS = 2;
/** Output cap for the judge's JSON verdict (was 4000). Leaves room for reasoning models' thinking. */
export const JUDGE_MAX_TOKENS = 1500;

export interface RacePlan {
  /** Worst-case requests per provider: one per competitor + every judge attempt. */
  needs: Partial<Record<ProviderId, number>>;
  competitorRequests: number;
  judgeRequests: number;
  judges: { id: string; name: string }[];
  preflight: PreflightResult;
}

export class RaceError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export class RaceEngine {
  private live = new Map<string, { record: RaceRecord; listeners: Set<Listener> }>();
  private history: RaceRecord[];

  constructor(
    private catalog: Catalog,
    private quota: QuotaManager,
    private store: JsonStore<RaceRecord[]>,
    private getSettings: () => Settings,
  ) {
    this.history = store.read();
    // Any race that was mid-flight when the server stopped can't be resumed.
    for (const r of this.history) {
      if (r.status === 'running' || r.status === 'judging' || r.status === 'ready') {
        r.status = 'failed';
        r.finishedAt ??= Date.now();
        const t = r.events.at(-1)?.t ?? 0;
        r.events.push({ t, type: 'race.failed', data: { error: 'Server restarted mid-race — this race could not be finished.' } });
        for (const c of r.competitors) if (c.status !== 'finished' && c.status !== 'dnf') Object.assign(c, { status: 'dnf', error: 'server restarted' });
      }
    }
  }

  private validateLineup(modelIds: unknown): string[] {
    const ids = [...new Set(Array.isArray(modelIds) ? modelIds.filter((x): x is string => typeof x === 'string') : [])];
    if (ids.length < 1) throw new RaceError('Select at least one competitor');
    if (ids.length > 5) throw new RaceError('A race supports at most 5 competitors');
    return ids;
  }

  /**
   * Worst-case request budget for a lineup (competitors + up to MAX_JUDGE_ATTEMPTS judges),
   * checked against remaining daily and per-minute quota. Makes no provider requests.
   */
  async plan(modelIds: unknown): Promise<RacePlan> {
    const ids = this.validateLineup(modelIds);
    const all = await this.catalog.list();
    const competitors = ids.map((id) => all.find((m) => m.id === id)).filter((m): m is ModelInfo => !!m);
    const judges = (await this.judgeCandidates(ids, ids)).slice(0, MAX_JUDGE_ATTEMPTS);
    const needs: Partial<Record<ProviderId, number>> = {};
    for (const m of [...competitors, ...judges]) needs[m.provider] = (needs[m.provider] ?? 0) + 1;
    return {
      needs,
      competitorRequests: competitors.length,
      judgeRequests: judges.length,
      judges: judges.map((j) => ({ id: j.id, name: j.name })),
      preflight: this.quota.preflight(needs),
    };
  }

  async create(prompt: string, modelIds: string[]): Promise<RaceRecord> {
    prompt = (prompt ?? '').trim();
    if (!prompt) throw new RaceError('Prompt is required');
    if (prompt.length > 8000) throw new RaceError('Prompt is too long (max 8000 characters)');
    const ids = this.validateLineup(modelIds);

    const models: ModelInfo[] = [];
    for (const id of ids) {
      const m = await this.catalog.get(id);
      if (!m) throw new RaceError(`Unknown model: ${id}`);
      if (!m.available) throw new RaceError(`${m.name} is unavailable: ${m.unavailableReason}`, 409);
      models.push(m);
    }
    const plan = await this.plan(ids);
    if (!plan.preflight.ok) throw new RaceError(plan.preflight.reason!, 429);

    const settings = this.getSettings();
    const record: RaceRecord = {
      id: randomUUID(),
      prompt,
      createdAt: Date.now(),
      status: 'ready',
      weights: settings.weights,
      events: [],
      competitors: models.map((m, lane) => ({
        modelId: m.id,
        name: m.name,
        provider: m.provider,
        lane,
        status: 'queued',
        text: '',
        reasoningChars: 0,
        tokensEstimated: true,
      })),
    };
    this.live.set(record.id, { record, listeners: new Set() });
    // A race that is created but never started (user left during the countdown) is discarded.
    setTimeout(() => {
      if (this.live.get(record.id)?.record.status === 'ready') this.live.delete(record.id);
    }, ABANDON_MS).unref?.();
    this.emit(record, 'race.created', { competitors: record.competitors.map(pick) });
    return record;
  }

  get(id: string): RaceRecord | undefined {
    return this.live.get(id)?.record ?? this.history.find((r) => r.id === id);
  }

  list(): RaceRecord[] {
    return this.history;
  }

  subscribe(id: string, fn: Listener): (() => void) | null {
    const entry = this.live.get(id);
    if (!entry) return null;
    entry.listeners.add(fn);
    return () => entry.listeners.delete(fn);
  }

  isLive(id: string) {
    const r = this.live.get(id)?.record;
    return !!r && r.status !== 'complete' && r.status !== 'failed';
  }

  async start(id: string): Promise<RaceRecord> {
    const entry = this.live.get(id);
    if (!entry) throw new RaceError('Race not found', 404);
    const r = entry.record;
    if (r.status !== 'ready') return r;
    // Quota may have been used up between create and start (countdown) — re-check before any request.
    const plan = await this.plan(r.competitors.map((c) => c.modelId));
    if (r.status !== 'ready') return r; // a concurrent start already launched it
    if (!plan.preflight.ok) {
      r.status = 'failed';
      r.finishedAt = Date.now();
      this.emit(r, 'race.failed', { error: plan.preflight.reason });
      this.persist(r);
      setTimeout(() => this.live.delete(r.id), 5 * 60_000).unref?.();
      return r;
    }
    r.status = 'running';
    r.startedAt = Date.now();
    this.emit(r, 'race.start', { prompt: r.prompt });
    this.persist(r); // saved from the start, so a restart mid-race still leaves a (red-flagged) replay
    void this.run(r);
    return r;
  }

  private emit(r: RaceRecord, type: string, data: Record<string, unknown>) {
    const ev: RaceEvent = { t: r.startedAt ? Date.now() - r.startedAt : 0, type, data };
    r.events.push(ev);
    const listeners = this.live.get(r.id)?.listeners;
    if (listeners) for (const l of listeners) l(ev);
  }

  private async run(r: RaceRecord) {
    const settings = this.getSettings();
    try {
      await Promise.all(r.competitors.map((c) => this.drive(r, c, settings)));
      r.status = 'judging';
      const evaluation = await this.judge(r, settings);
      r.evaluation = evaluation;
      r.competitors = scoreCompetitors(r.competitors, r.weights);
      const champ = r.competitors.find((c) => c.rank === 1 && c.status === 'finished');
      r.championId = champ?.modelId;
      r.status = 'complete';
      r.finishedAt = Date.now();
      this.emit(r, 'race.complete', {
        championId: r.championId ?? null,
        evaluation,
        standings: r.competitors.map((c) => ({
          lane: c.lane,
          modelId: c.modelId,
          rank: c.rank,
          scores: c.scores,
          judge: c.judge ?? null,
          latencyMs: c.latencyMs ?? null,
          status: c.status,
        })),
      });
    } catch (err) {
      r.status = 'failed';
      r.finishedAt = Date.now();
      this.emit(r, 'race.failed', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.persist(r);
      setTimeout(() => this.live.delete(r.id), 5 * 60_000).unref?.();
    }
  }

  private async drive(r: RaceRecord, c: CompetitorResult, settings: Settings) {
    const model = (await this.catalog.get(c.modelId))!;
    const provider = this.catalog.provider(model.provider)!;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);
    const sentAt = Date.now();
    let firstAt: number | null = null;
    let lastFlush = 0;
    let pending = '';
    const finishOrder = () => r.competitors.filter((x) => x.status === 'finished').length;

    const tokensSoFar = () => Math.round((c.text.length + c.reasoningChars) / 4);
    const flush = (force = false) => {
      const now = Date.now();
      if (!force && now - lastFlush < PROGRESS_INTERVAL_MS) return;
      lastFlush = now;
      const elapsed = firstAt ? (now - firstAt) / 1000 : 0;
      const tokens = tokensSoFar();
      this.emit(r, 'car.progress', {
        lane: c.lane,
        append: pending,
        tokens,
        answerChars: c.text.length,
        reasoningChars: c.reasoningChars,
        tps: elapsed > 0.2 ? Math.round((tokens / elapsed) * 10) / 10 : 0,
        phase: c.text.length ? 'answering' : 'thinking',
      });
      pending = '';
    };
    const onFirst = () => {
      if (firstAt) return;
      firstAt = Date.now();
      c.ttftMs = firstAt - sentAt;
      c.status = 'streaming';
      this.emit(r, 'car.first_token', { lane: c.lane, ttftMs: c.ttftMs });
    };

    c.status = 'waiting';
    this.emit(r, 'car.launch', { lane: c.lane });
    try {
      // Re-check live availability (paid lock, cooldowns, quota) right before spending a request.
      if (!model.available) throw new ProviderError(`not started: ${model.unavailableReason}`, 'not_configured');
      this.quota.recordRequest(model.provider);
      const result = await provider.stream({
        model: model.providerModel,
        prompt: r.prompt,
        system: settings.systemPrompt || undefined,
        maxTokens: settings.maxTokens,
        reasoningEffort: model.reasoning ? 'low' : undefined,
        signal: controller.signal,
        onDelta: (t) => {
          onFirst();
          c.text += t;
          pending += t;
          flush();
        },
        onReasoning: (t) => {
          onFirst();
          c.reasoningChars += t.length;
          flush();
        },
      });
      flush(true);
      if (!result.text.trim()) {
        throw new ProviderError(
          c.reasoningChars > 0
            ? `spent its whole ${settings.maxTokens}-token budget reasoning and never answered (raise "Max output tokens" in Settings)`
            : 'returned an empty answer',
          'other',
        );
      }
      c.text = result.text;
      c.latencyMs = Date.now() - sentAt;
      c.outputTokens = result.outputTokens ?? tokensSoFar();
      c.tokensEstimated = result.outputTokens == null;
      const genSecs = firstAt ? (Date.now() - firstAt) / 1000 : c.latencyMs / 1000;
      c.tokensPerSec = genSecs > 0 ? Math.round((c.outputTokens / genSecs) * 10) / 10 : undefined;
      c.status = 'finished';
      this.quota.recordSuccess(model.provider);
      this.emit(r, 'car.finish', {
        lane: c.lane,
        position: finishOrder(),
        latencyMs: c.latencyMs,
        ttftMs: c.ttftMs ?? null,
        outputTokens: c.outputTokens,
        tokensEstimated: c.tokensEstimated,
        tps: c.tokensPerSec ?? null,
        finishReason: result.finishReason ?? null,
      });
      this.persist(r);
    } catch (err) {
      flush(true);
      const aborted = controller.signal.aborted;
      c.status = 'dnf';
      c.latencyMs = Date.now() - sentAt;
      c.error = aborted ? `timed out after ${Math.round(settings.timeoutMs / 1000)}s` : err instanceof Error ? err.message : String(err);
      this.quota.recordFailure(model.provider, model.id, aborted ? new ProviderError('timeout', 'timeout') : err);
      this.emit(r, 'car.dnf', { lane: c.lane, error: c.error });
      this.persist(r);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Ordered judge candidates: the configured judge (if available), then neutral free models that
   * aren't competing, then free competitors that finished. Only available models are returned.
   */
  private async judgeCandidates(competitorIds: string[], finishedIds: string[]): Promise<ModelInfo[]> {
    const settings = this.getSettings();
    const models = (await this.catalog.list()).filter((m) => m.available);
    const inRace = new Set(competitorIds);
    const finished = new Set(finishedIds);
    const out: ModelInfo[] = [];
    if (settings.judgeModel !== 'auto') {
      const m = models.find((x) => x.id === settings.judgeModel);
      if (m) out.push(m);
    }
    out.push(...models.filter((m) => m.free && !inRace.has(m.id)));
    out.push(...models.filter((m) => m.free && finished.has(m.id)));
    return [...new Map(out.map((m) => [m.id, m])).values()];
  }

  private async pickJudges(r: RaceRecord): Promise<ModelInfo[]> {
    const finished = r.competitors.filter((c) => c.status === 'finished').map((c) => c.modelId);
    return (await this.judgeCandidates(r.competitors.map((c) => c.modelId), finished)).slice(0, MAX_JUDGE_ATTEMPTS);
  }

  private async judge(r: RaceRecord, settings: Settings): Promise<Evaluation> {
    const finished = r.competitors.filter((c) => c.status === 'finished');
    if (!finished.length) return { method: 'unavailable', note: 'No competitor finished, so there was nothing to judge.' };
    const labels = finished.map((_, i) => String.fromCharCode(65 + i));
    const prompt = buildJudgePrompt(r.prompt, finished.map((c, i) => ({ label: labels[i], text: c.text })));
    const judges = await this.pickJudges(r);
    const failures: string[] = [];
    const exhausted = new Set<ProviderId>();

    for (const j of judges) {
      const provider = this.catalog.provider(j.provider)!;
      // Stop when the provider's free quota is gone — never retry into a known limit.
      const blocked = exhausted.has(j.provider) ? 'free quota exhausted' : this.quota.check(j.provider, j.id);
      if (blocked) {
        failures.push(`${j.name}: skipped (${blocked})`);
        continue;
      }
      this.emit(r, 'judge.start', { judgeModel: j.id, judgeName: j.name });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000);
      try {
        this.quota.recordRequest(j.provider);
        const res = await provider.stream({
          model: j.providerModel,
          prompt,
          system: JUDGE_SYSTEM,
          maxTokens: JUDGE_MAX_TOKENS,
          reasoningEffort: j.reasoning ? 'low' : undefined,
          signal: controller.signal,
          onDelta: () => undefined,
        });
        const parsed = parseJudgeResponse(res.text, labels);
        this.quota.recordSuccess(j.provider);
        finished.forEach((c, i) => (c.judge = parsed.scores[labels[i]]));
        const selfJudged = r.competitors.some((c) => c.modelId === j.id);
        this.emit(r, 'judge.done', { judgeModel: j.id });
        return {
          method: 'llm-judge',
          judgeModel: j.id,
          judgeName: j.name,
          summary: parsed.summary,
          note: selfJudged ? 'Judge was also a competitor (no neutral free model was available); its own score may be biased.' : undefined,
        };
      } catch (err) {
        const msg = controller.signal.aborted ? 'timed out' : err instanceof Error ? err.message : String(err);
        failures.push(`${j.name}: ${msg}`);
        this.quota.recordFailure(j.provider, j.id, err);
        if (err instanceof ProviderError && (err.kind === 'daily_quota' || err.kind === 'auth')) exhausted.add(j.provider);
        this.emit(r, 'judge.failed', { judgeModel: j.id, error: msg });
      } finally {
        clearTimeout(timeout);
      }
    }
    return {
      method: 'unavailable',
      note: `No judge verdict (${failures.join('; ') || 'no judge model available'}). Ranked on speed and completion only.`,
    };
  }

  private persist(r: RaceRecord) {
    this.history = [r, ...this.history.filter((x) => x.id !== r.id)].slice(0, MAX_HISTORY);
    this.store.write(this.history);
  }
}

function pick(c: CompetitorResult) {
  return { lane: c.lane, modelId: c.modelId, name: c.name, provider: c.provider };
}
