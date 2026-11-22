import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { Catalog } from './catalog.js';
import { config, RESTART_HINT } from './config.js';
import { buildLeaderboard } from './leaderboard.js';
import { FilePersistence, Persistence } from './lib/persistence.js';
import { hostGuard, makeHostRules, requireAccessCode } from './lib/security.js';
import { demoRace, demoRaces } from './demo.js';
import { LiveryMap, parseCustom } from './liveries.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenAIProvider } from './providers/openai.js';
import { OpenRouterProvider } from './providers/openrouter.js';
import { QuotaManager } from './quota.js';
import { RaceEngine, RaceError } from './race.js';
import { Provider, ProviderError, ProviderId, RaceRecord, Settings } from './types.js';

export const DEFAULT_SETTINGS: Settings = {
  judgeModel: 'auto',
  weights: { quality: 65, speed: 25, completion: 10 },
  maxTokens: 1000, // headroom for reasoning models (all current free models support `reasoning`)
  timeoutMs: 120_000,
  allowPaid: false,
  systemPrompt: 'Answer the user directly and accurately. Be concise but complete.',
};

export interface AppOptions {
  dataDir?: string;
  providers?: Provider[];
  serveClient?: boolean;
  /** Dev only: redirect non-API page requests here (the Vite dev server with live reload). */
  devClientUrl?: string;
  /** 'test' marks the synthetic UI harness so the client shows a TEST MODE banner. */
  mode?: 'live' | 'test';
  /** Override the env-derived paid lock (tests). Defaults to `ALLOW_PAID_PROVIDERS !== "true"`. */
  paidLocked?: () => boolean;
  /** Where state lives (default: JSON files in dataDir). Serverless uses BlobPersistence. */
  persistence?: Persistence;
  /** Running as a serverless function (Vercel): final-only persistence and capped timeouts. */
  serverless?: boolean;
  /** Owner access code required for quota-spending and settings routes (public deployments). */
  accessCode?: () => string | undefined;
  /** Extra hostnames this server answers for (the public deployment's domains). */
  allowedHosts?: string[];
  /** Cap on live AI races per UTC day on this deployment (protects the owner's free quota). */
  maxLiveRacesPerDay?: number;
  /** When set, live races are refused with this message (e.g. durable storage not configured). */
  liveRacesDisabled?: string;
}

const SSE_HEADERS = { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' };

export function createApp(opts: AppOptions = {}) {
  const dataDir = opts.dataDir ?? config.dataDir;
  const paidLocked = opts.paidLocked ?? (() => !config.paidAllowedByEnv());
  const providers = opts.providers ?? [new OpenRouterProvider(), new AnthropicProvider(), new OpenAIProvider()];
  const persistence = opts.persistence ?? new FilePersistence(dataDir);
  const serverless = !!opts.serverless;
  const settingsStore = persistence.store<Settings>('settings.json', () => DEFAULT_SETTINGS);
  let settings: Settings = { ...DEFAULT_SETTINGS, ...settingsStore.read() };
  /** Effective settings: the env paid lock always wins over a stored allowPaid=true. */
  const getSettings = (): Settings => (paidLocked() && settings.allowPaid ? { ...settings, allowPaid: false } : settings);

  const quota = new QuotaManager(persistence.store('quota.json', () => ({ providers: {}, models: {} })));
  const catalog = new Catalog(providers, quota, getSettings, paidLocked);
  const engine = new RaceEngine(
    catalog,
    quota,
    persistence.store<RaceRecord[]>('races.json', () => []),
    getSettings,
    // Vercel functions stop after 300 s: cap each car at 90 s and each judge attempt at 60 s.
    serverless ? { persistLive: false, maxCarMs: 90_000, judgeMs: 60_000 } : {},
  );
  const liveryStore = persistence.store<LiveryMap>('liveries.json', () => ({}));
  let liveries: LiveryMap = liveryStore.read();

  /** Pick up state written by other serverless instances (no-op for local files). */
  const reloadState = () => {
    settings = { ...DEFAULT_SETTINGS, ...settingsStore.read() };
    liveries = liveryStore.read();
    quota.reload();
  };
  async function syncRemote(force = false) {
    if (await persistence.refresh(force)) reloadState();
  }

  /** Verifies a provider's key and refreshes known limits. */
  async function validate(id: ProviderId) {
    const p = catalog.provider(id);
    if (!p) return;
    if (!p.isConfigured()) return quota.setValidation(id, 'missing_key');
    // Never contact a paid provider (not even to list models) while paid usage is locked.
    if (p.billing === 'paid' && paidLocked()) return;
    // Serverless cold starts: skip re-checking a key that was verified in the last 15 minutes.
    const q = quota.get(id);
    if (serverless && q.validation === 'ok' && q.dailyLimit != null && q.lastValidatedAt && Date.now() - q.lastValidatedAt < 15 * 60_000) return;
    try {
      if (p instanceof OpenRouterProvider) {
        const info = await p.keyInfo();
        // OpenRouter documents free-model limits of 20 req/min, and 50 req/day for accounts
        // that have purchased under $10 of credits (1000/day otherwise).
        const daily = info.is_free_tier ? 50 : 1000;
        quota.setLimits(id, {
          dailyLimit: daily,
          rpm: 20,
          keyNote: `${info.is_free_tier ? 'Free tier' : 'Has purchased credits'} · free-model cap ${daily}/day, 20/min`,
        });
      } else {
        await p.listModels();
      }
      quota.setValidation(id, 'ok');
    } catch (err) {
      const kind = err instanceof ProviderError ? err.kind : 'other';
      quota.setValidation(id, kind === 'auth' ? 'invalid_key' : 'error', err instanceof Error ? err.message : String(err));
    }
  }
  quota.setRevalidator(async (id) => {
    await validate(id);
    await catalog.list(true);
  });
  // Load persisted state FIRST (so validation never overwrites stored quota counters), then verify keys.
  const ready = (async () => {
    try {
      await syncRemote(true);
    } catch (e) {
      console.error('[persistence] initial load failed', e);
    }
    await Promise.all(providers.map((p) => validate(p.id))).catch(() => undefined);
  })();
  const access = requireAccessCode(() => opts.accessCode?.());
  const hostRules = makeHostRules(opts.allowedHosts ?? []);

  const app = express();
  app.disable('x-powered-by');
  app.use(hostGuard(hostRules));
  app.use(cors({ origin: (origin, cb) => cb(null, hostRules.isAllowedOrigin(origin)) }));
  app.use(express.json({ limit: '64kb' }));

  const wrap = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);

  // Every API call sees fresh shared state (throttled inside BlobPersistence; free for local files).
  app.use('/api', (req, res, next) => {
    void (async () => {
      await ready;
      await syncRemote();
    })().then(() => next(), next);
  });

  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, time: Date.now(), mode: opts.mode ?? 'live', deployment: serverless ? 'cloud' : 'local', storage: persistence.kind, accessRequired: !!opts.accessCode?.() }),
  );

  /** Lets the client check an access code before racing (wrong codes are rate-limited). */
  app.get('/api/access', (_req, res) => res.json({ required: !!opts.accessCode?.() }));
  app.post('/api/access/verify', access, (_req, res) => res.json({ ok: true }));

  app.get('/api/models', wrap(async (req, res) => {
    await ready;
    res.json({ models: await catalog.list(req.query.refresh === '1'), errors: catalog.listErrors() });
  }));

  app.get('/api/providers', wrap(async (_req, res) => {
    await ready;
    const snap = quota.snapshot();
    const models = await catalog.list();
    const s = getSettings();
    res.json({
      env: {
        paidLocked: paidLocked(),
        envChangedSinceStart: config.envChangedSinceStart(),
        restartHint: RESTART_HINT,
      },
      providers: providers.map((p) => ({
        id: p.id,
        label: p.label,
        billing: p.billing,
        configured: p.isConfigured(),
        keyEnvVar: p.keyEnvVar,
        locked: p.billing === 'paid' && paidLocked(),
        enabled: p.isConfigured() && (p.billing === 'free' || s.allowPaid),
        modelCount: models.filter((m) => m.provider === p.id).length,
        availableCount: models.filter((m) => m.provider === p.id && m.available).length,
        quota: snap.providers[p.id] ?? null,
        listError: catalog.listErrors()[p.id] ?? null,
      })),
      modelCooldowns: snap.models,
      nextDailyReset: snap.nextDailyReset,
    });
  }));

  app.post('/api/providers/revalidate', access, wrap(async (_req, res) => {
    await Promise.all(providers.map((p) => validate(p.id)));
    await catalog.list(true);
    await persistence.flush();
    res.json({ ok: true });
  }));

  app.get('/api/settings', (_req, res) => res.json({ ...getSettings(), paidLocked: paidLocked() }));
  app.put('/api/settings', access, wrap(async (req, res) => {
    const b = req.body ?? {};
    if (b.allowPaid === true && paidLocked()) {
      return void res.status(403).json({
        error: 'Paid providers are locked by ALLOW_PAID_PROVIDERS=false in the root .env. Settings cannot override this.',
      });
    }
    const num = (v: unknown, lo: number, hi: number, d: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d;
    };
    settings = {
      judgeModel: typeof b.judgeModel === 'string' ? b.judgeModel : settings.judgeModel,
      weights: {
        quality: num(b.weights?.quality, 0, 100, settings.weights.quality),
        speed: num(b.weights?.speed, 0, 100, settings.weights.speed),
        completion: num(b.weights?.completion, 0, 100, settings.weights.completion),
      },
      maxTokens: num(b.maxTokens, 64, 4000, settings.maxTokens),
      timeoutMs: num(b.timeoutMs, 10_000, 300_000, settings.timeoutMs),
      allowPaid: paidLocked() ? false : typeof b.allowPaid === 'boolean' ? b.allowPaid : settings.allowPaid,
      systemPrompt: typeof b.systemPrompt === 'string' ? b.systemPrompt.slice(0, 2000) : settings.systemPrompt,
    };
    settingsStore.write(settings);
    await persistence.flush();
    res.json({ ...getSettings(), paidLocked: paidLocked() });
  }));

  /** Dry run: how many requests a lineup would use and whether quota allows it. Makes no provider requests. */
  app.post('/api/races/preflight', wrap(async (req, res) => {
    await ready;
    res.json(await engine.plan(req.body?.models));
  }));

  const checkDailyCap = () => {
    if (opts.liveRacesDisabled) throw new RaceError(opts.liveRacesDisabled, 503);
    const cap = opts.maxLiveRacesPerDay;
    if (!cap) return;
    const today = new Date().toISOString().slice(0, 10);
    const n = engine.list().filter((r) => new Date(r.createdAt).toISOString().slice(0, 10) === today).length;
    if (n >= cap) throw new RaceError(`This deployment's daily limit of ${cap} live AI races is reached (resets 00:00 UTC). Demo races are still available.`, 429);
  };

  /**
   * One-request race (works on serverless): validates + quota-preflights, then streams every race
   * event as Server-Sent Events on this response until the race is judged and saved.
   */
  app.post('/api/races/run', access, wrap(async (req, res) => {
    await ready;
    checkDailyCap();
    const race = await engine.create(req.body?.prompt, req.body?.models);
    res.writeHead(200, SSE_HEADERS);
    res.flushHeaders?.();
    let open = true;
    req.on('close', () => (open = false));
    const send = (ev: { type: string }) => {
      if (open && !res.writableEnded) res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
    };
    race.events.forEach(send);
    const unsubscribe = engine.subscribe(race.id, send);
    const ping = setInterval(() => open && res.write(': ping\n\n'), 10_000);
    try {
      await engine.start(race.id);
      await engine.finished(race.id); // the race keeps running (and is saved) even if the phone disconnects
      await persistence.flush();
    } finally {
      clearInterval(ping);
      unsubscribe?.();
      if (open && !res.writableEnded) {
        res.write(`event: saved\ndata: ${JSON.stringify({ id: race.id })}\n\n`);
        res.write('event: end\ndata: {}\n\n');
        res.end();
      }
    }
  }));

  app.post('/api/races', access, wrap(async (req, res) => {
    checkDailyCap();
    await ready;
    const race = await engine.create(req.body?.prompt, req.body?.models);
    res.status(201).json(race);
  }));

  app.post('/api/races/:id/start', access, wrap(async (req, res) => {
    res.json(await engine.start(String(req.params.id)));
  }));

  app.get('/api/races', (_req, res) => {
    res.json({
      races: engine.list().map((r) => ({
        id: r.id,
        prompt: r.prompt,
        createdAt: r.createdAt,
        status: r.status,
        championId: r.championId ?? null,
        evaluation: r.evaluation ?? null,
        competitors: r.competitors.map((c) => ({ modelId: c.modelId, name: c.name, provider: c.provider, lane: c.lane, rank: c.rank, status: c.status, latencyMs: c.latencyMs, scores: c.scores })),
      })),
    });
  });

  app.get('/api/races/:id', (req, res) => {
    const r = engine.get(String(req.params.id));
    if (!r) return void res.status(404).json({ error: 'Race not found' });
    res.json(r);
  });

  /** Server-Sent Events: replays every event so far, then streams live ones. */
  app.get('/api/races/:id/stream', (req, res) => {
    const id = String(req.params.id);
    const r = engine.get(id);
    if (!r) return void res.status(404).json({ error: 'Race not found' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (ev: { type: string }) => res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
    for (const ev of r.events) send(ev);
    if (!engine.isLive(id)) {
      res.write('event: end\ndata: {}\n\n');
      return void res.end();
    }
    const unsubscribe = engine.subscribe(id, (ev) => {
      send(ev);
      if (ev.type === 'race.complete' || ev.type === 'race.failed') {
        res.write('event: end\ndata: {}\n\n');
        res.end();
      }
    });
    const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
    req.on('close', () => {
      clearInterval(ping);
      unsubscribe?.();
    });
  });

  app.get('/api/leaderboard', (_req, res) => res.json({ rows: buildLeaderboard(engine.list()) }));

  // ---- DEMO races: simulated, read-only, never stored and never on the leaderboard ----
  app.get('/api/demo/races', (_req, res) => {
    res.json({
      races: demoRaces().map((r) => ({
        id: r.id,
        prompt: r.prompt,
        createdAt: r.createdAt,
        status: r.status,
        championId: r.championId ?? null,
        demo: r.demo,
        durationMs: r.events.at(-1)?.t ?? 0,
        competitors: r.competitors.map((c) => ({ modelId: c.modelId, name: c.name, provider: c.provider, lane: c.lane, rank: c.rank, status: c.status, latencyMs: c.latencyMs, scores: c.scores })),
      })),
    });
  });
  app.get('/api/demo/races/:id', (req, res) => {
    const r = demoRace(String(req.params.id));
    if (!r) return void res.status(404).json({ error: 'Demo race not found' });
    res.json(r);
  });

  // ---- Car customization (colour, number, body style, nickname) ----
  app.get('/api/liveries', (_req, res) => res.json({ liveries }));
  app.put('/api/liveries', access, wrap(async (req, res) => {
    let parsed;
    try {
      parsed = parseCustom(req.body);
    } catch (e) {
      return void res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid customization' });
    }
    const known = (await catalog.list()).some((m) => m.id === parsed.modelId) || engine.list().some((r) => r.competitors.some((c) => c.modelId === parsed.modelId));
    if (!known) return void res.status(404).json({ error: 'Unknown model' });
    const { updatedAt, ...fields } = parsed.custom;
    if (Object.keys(fields).length === 0) delete liveries[parsed.modelId];
    else liveries[parsed.modelId] = { ...fields, updatedAt };
    liveryStore.write(liveries);
    await persistence.flush();
    res.json({ modelId: parsed.modelId, livery: liveries[parsed.modelId] ?? null });
  }));
  app.delete('/api/liveries', access, wrap(async (req, res) => {
    const modelId = typeof req.query.modelId === 'string' ? req.query.modelId : '';
    delete liveries[modelId];
    liveryStore.write(liveries);
    await persistence.flush();
    res.json({ ok: true });
  }));

  if (opts.serveClient && opts.devClientUrl) {
    // Dev: never serve the stale production build — send page requests to the live Vite app (auto-reload).
    const target = opts.devClientUrl.replace(/\/$/, '');
    app.get(/^(?!\/api).*/, (req, res) => res.redirect(302, `${target}${req.originalUrl}`));
  } else if (opts.serveClient && fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof RaceError) return void res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  });

  return { app, engine, quota, catalog, ready, persistence };
}
