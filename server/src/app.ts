import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { Catalog } from './catalog.js';
import { config, RESTART_HINT } from './config.js';
import { buildLeaderboard } from './leaderboard.js';
import { isAllowedOrigin, localOnly } from './lib/security.js';
import { JsonStore } from './lib/store.js';
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
}

export function createApp(opts: AppOptions = {}) {
  const dataDir = opts.dataDir ?? config.dataDir;
  const paidLocked = opts.paidLocked ?? (() => !config.paidAllowedByEnv());
  const providers = opts.providers ?? [new OpenRouterProvider(), new AnthropicProvider(), new OpenAIProvider()];
  const settingsStore = new JsonStore<Settings>(dataDir, 'settings.json', () => DEFAULT_SETTINGS);
  let settings: Settings = { ...DEFAULT_SETTINGS, ...settingsStore.read() };
  /** Effective settings: the env paid lock always wins over a stored allowPaid=true. */
  const getSettings = (): Settings => (paidLocked() && settings.allowPaid ? { ...settings, allowPaid: false } : settings);

  const quota = new QuotaManager(new JsonStore(dataDir, 'quota.json', () => ({ providers: {}, models: {} })));
  const catalog = new Catalog(providers, quota, getSettings, paidLocked);
  const engine = new RaceEngine(catalog, quota, new JsonStore<RaceRecord[]>(dataDir, 'races.json', () => []), getSettings);

  /** Verifies a provider's key and refreshes known limits. */
  async function validate(id: ProviderId) {
    const p = catalog.provider(id);
    if (!p) return;
    if (!p.isConfigured()) return quota.setValidation(id, 'missing_key');
    // Never contact a paid provider (not even to list models) while paid usage is locked.
    if (p.billing === 'paid' && paidLocked()) return;
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
  const ready = Promise.all(providers.map((p) => validate(p.id))).catch(() => undefined);

  const app = express();
  app.disable('x-powered-by');
  app.use(localOnly);
  app.use(cors({ origin: (origin, cb) => cb(null, isAllowedOrigin(origin)) }));
  app.use(express.json({ limit: '64kb' }));

  const wrap = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);

  app.get('/api/health', (_req, res) => res.json({ ok: true, time: Date.now(), mode: opts.mode ?? 'live' }));

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

  app.post('/api/providers/revalidate', wrap(async (_req, res) => {
    await Promise.all(providers.map((p) => validate(p.id)));
    await catalog.list(true);
    res.json({ ok: true });
  }));

  app.get('/api/settings', (_req, res) => res.json({ ...getSettings(), paidLocked: paidLocked() }));
  app.put('/api/settings', (req, res) => {
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
    res.json({ ...getSettings(), paidLocked: paidLocked() });
  });

  /** Dry run: how many requests a lineup would use and whether quota allows it. Makes no provider requests. */
  app.post('/api/races/preflight', wrap(async (req, res) => {
    await ready;
    res.json(await engine.plan(req.body?.models));
  }));

  app.post('/api/races', wrap(async (req, res) => {
    await ready;
    const race = await engine.create(req.body?.prompt, req.body?.models);
    res.status(201).json(race);
  }));

  app.post('/api/races/:id/start', wrap(async (req, res) => {
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

  return { app, engine, quota, catalog, ready };
}
