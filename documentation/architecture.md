# Model Arena — Architecture

Model Arena is a TypeScript monorepo (npm workspaces) with a React client and an Express server.
Everything below was built from scratch during AppFusion Hackathon 2026 (project created 21 Nov 2026, ~2:45 PM).

## Components

| Layer | Technology (verified in `package.json`) | Responsibility |
|---|---|---|
| Client | React 19, TypeScript, Vite 8, Tailwind CSS 4, Framer Motion, Zustand 5, React Router 7 | Seven sections, live race HUD, replays, Garage paint shop, PWA shell |
| 3D | three.js 0.187 via React Three Fiber 9, drei, postprocessing (bloom) | Track, cars, chase camera, garage turntable |
| Server | Node.js 24, Express 5, TypeScript | REST + Server-Sent Events API, race engine, judge, scoring, quota |
| AI provider | OpenRouter Chat Completions (streaming, `fetch` + SSE parser) | Only `:free` models priced at $0 |
| Storage | Local: JSON files in `server/data/`. Cloud: one private Vercel Blob document | Races, quota counters, settings, car liveries |
| Hosting (prepared) | Vercel static hosting + one Express function (`api/index.js`, 300 s max) | Public PWA |

```
 Browser / iPhone (React PWA)
   │  GET /api/models, /api/races, /api/leaderboard, /api/demo/races …   (polling 5–30 s)
   │  POST /api/races/run  ── one request ──►  streamed SSE events back
   ▼
 Express app (server/src/app.ts)
   ├─ hostGuard (allowed hosts + same-origin) → requireAccessCode (public deployments)
   ├─ Catalog  ── GET openrouter.ai/api/v1/models  (keeps only :free + every price field = 0)
   ├─ QuotaManager  (daily + per-minute counters, cooldowns, preflight budget)
   ├─ RaceEngine
   │    ├─ drive(): same prompt → every car concurrently → OpenRouter stream → car.* events
   │    ├─ judge(): anonymous answers A/B/C… → neutral free judge model → JSON scores
   │    └─ scoreCompetitors(): quality/speed/completion → ranks → champion
   ├─ demo.ts   (3 scripted DEMO races — never stored, never ranked)
   └─ Persistence (FilePersistence | BlobPersistence)
```

## Race data flow
1. **Garage → Race:** the user picks 1–5 free models and a prompt. The client asks `POST /api/races/preflight`
   for the request budget (cars + up to 2 judge attempts) — a dry run, no AI call.
2. **Start:** after the 3-2-1 countdown the client sends `POST /api/races/run {prompt, models}`.
   The server validates (prompt 1–8000 chars, 1–5 known, available models), re-checks quota, then
   streams Server-Sent Events on the same response.
3. **Racing:** the identical prompt and system prompt are sent to every model concurrently
   (`Promise.all` in `RaceEngine.run`). Events: `car.launch`, `car.first_token` (TTFT), `car.progress`
   (~every 120 ms: appended text, tokens, tokens/s), `car.finish` (latency, position) or `car.dnf` (error).
4. **Judging:** `judge.start/done/failed`, then `race.complete` with standings, scores and the judge summary.
5. **Saved:** the full event timeline is stored, so **Replays** play the race back at the original timing.

## How the 3D race reflects the AI results
Car position is derived only from stream data (`client/src/lib/raceState.ts → targetProgress`):
grid until the request is sent → slow creep while waiting for the first token → progress curve driven by
tokens received → across the line when the response completes. DNF cars stop. After judging, the
**champion and podium come from the scores**, not from who crossed the line first (speed is only 25 %).

## Persistence
`server/src/lib/persistence.ts` exposes the same synchronous store API for both backends.
- **Local:** atomic JSON writes in `server/data/` (`races.json`, `quota.json`, `settings.json`, `liveries.json`).
- **Cloud:** a single private blob `model-arena/state.json`; each instance re-reads at most every 60 s, writes
  are debounced and conditional on the ETag, with read-merge-retry (races merged by id). This keeps usage far
  inside the Vercel Blob Hobby allowance (2,000 advanced operations/month).

## Deployment design (Vercel, free Hobby plan)
- Static client from `client/dist`; `/api/*` rewritten to the Express function `api/index.js` (`maxDuration` 300 s).
- Serverless mode: one-request races (no in-memory state between requests), final-only persistence,
  per-car timeout ≤ 90 s and judge attempts ≤ 60 s so a race fits in 300 s.
- Live races are refused unless durable storage (Blob) **and** an owner access code are configured.
