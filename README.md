# Model Arena

A futuristic AI arcade racing game. You give one prompt to up to five AI models at the same moment. Each model is a neon race car on a 3D circuit, and its car moves only on that model's real streamed tokens. Lap times are measured latency, and a neutral AI steward grades the answers blind before a champion is crowned.

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Framer Motion, three.js via React Three Fiber, with bloom post-processing
- **Backend:** Node.js, Express 5, TypeScript, Server-Sent Events
- **Providers:** OpenRouter free models by default, plus the optional official Anthropic and OpenAI SDKs

## Quick start (macOS)

```bash
cd ~/projects/model-arena
npm install
cp .env.example .env        # then edit .env and paste your OpenRouter key
npm run dev
```

Then open **http://localhost:5173**. The API runs on http://localhost:8787, and Vite proxies `/api` to it.

To run in production mode, use `npm start`. It builds both packages and serves the app and API together on http://localhost:8787.

> In development, saving `.env` restarts the API automatically (`tsx watch --include ../.env`). With `npm start`, restart it yourself after editing `.env`. If the running server ever has a stale `.env`, Pit Crew, Garage and Race show a "restart the server" banner.
>
> Open the app on **:5173** while developing. Page requests to :8787 are redirected there so you never see a stale build. Every page refreshes its data automatically (every 5–30 s, and when you return to the tab), so new races, wins and quota changes appear without reloading.

## Local-only by design

- The API listens on `127.0.0.1` only (set `HOST` to change it). Other devices on your network can't reach it.
- It only answers requests addressed to `localhost`/`127.0.0.1`, which blocks DNS rebinding. Requests from other websites get a 403, so a page you visit can't start races, spend your free quota or change Settings.
- Your API key stays on the server. It is never sent to the browser, logged or stored anywhere except `.env`.

## API keys

| Variable | Required | Cost | Where |
|---|---|---|---|
| `OPENROUTER_API_KEY` | **Yes** (to race) | $0. Only `:free` models are used | https://openrouter.ai/settings/keys |
| `ANTHROPIC_API_KEY` | No | Billed per token | https://console.anthropic.com |
| `OPENAI_API_KEY` | No | Billed per token | https://platform.openai.com |
| `ALLOW_PAID_PROVIDERS` | No | — | Must be exactly `true` to unlock the paid-provider toggle in Settings |

**Free access rules the app follows:**
- The catalog comes live from OpenRouter's public model list and keeps only `:free` variants priced at $0. If a model disappears or errors, it is marked unavailable and you can pick another verified free model.
- Paid providers need two switches: `ALLOW_PAID_PROVIDERS=true` in `.env`, and then the **Paid providers** toggle in Settings.
  - Without the env setting, the server refuses the toggle (`PUT /api/settings` returns 403) and ignores any saved `allowPaid: true`.
  - It also never contacts Anthropic or OpenAI at all: no model listing and no inference.
  - The app never spends money on its own.
- A Claude.ai or ChatGPT subscription does **not** include API access. Those plans are not treated as API credits.
- Provider limits are honored and never bypassed. The documented OpenRouter free-model limits are 20 requests/min and 50 requests/day, or 1000/day once $10 of credits has been purchased. The daily limit resets at 00:00 UTC.

## How a race works

1. **Garage:** pick up to 5 models. Each model gets its own car, and the **Paint Shop** lets you set its **colour** (swatches or any custom colour), **racing number** (1–99), **body style** (Vortex, Spectre, Halcyon) and **nickname** (up to 18 characters).
   - Customizations are saved on the server (`server/data/liveries.json`). The car looks identical in the Garage, on the grid, in the HUD and live text, on the champion screen, in Champions, Replays and Home, and on any localhost port.
   - The real model name is always shown next to a nickname.
   - Cars you've added stay on the grid even when they're temporarily unavailable (cooldown or quota). They're flagged with the reason, and START is blocked until they're ready or removed.
2. **Race:** `POST /api/races` validates the lineup against live availability, then runs a **quota preflight**.
   - The whole race budget (one request per car, plus up to 2 judge requests) must fit in the remaining daily and per-minute free quota. Otherwise the server refuses with HTTP 429, and it checks again when the race starts.
   - `POST /api/races/preflight {models:[...]}` is a dry run that reports the request count.
   - The client then opens the SSE stream, runs the 3‑2‑1 countdown and calls `POST /api/races/:id/start`.
3. The server sends the same prompt to every model **concurrently**.
   - All current free models support OpenRouter's `reasoning` parameter, so the app asks them for `reasoning: { effort: "low" }` (judge included). That leaves the token budget (1,000 by default) for the actual answer.
   - If a model still spends its whole budget thinking, it gets a DNF with that reason.
   - It emits these events:
   - `car.launch`: the request is sent
   - `car.first_token`: time to first token (TTFT); the car launches with nitro
   - `car.progress`: about every 120 ms, with appended text, token count and tokens/sec; a surge in tok/s fires nitro
   - `car.finish`: measured latency and finishing position
   - `car.dnf`: an error or timeout
4. **Steward:** a free model that is *not* in the race grades every answer anonymously on accuracy, helpfulness, clarity and completeness (0–10 each). If no neutral model is available, a competitor judges, and the results show a bias warning. The judge makes at most 2 attempts with a 1500-token limit, and stops early if the free quota runs out. If judging fails, the race is ranked on speed and completion only, and the results say so.
5. **Scoring:** the default weights are 65% quality, 25% speed and 10% completion, and you can change them in Settings.
   - Quality is the judge's mean score × 10.
   - Speed is the fastest latency divided by this model's latency.
   - A DNF scores 0.
   - The highest total wins, and a tie goes to the lower latency.
6. Every race is saved with its full event timeline, from the moment it starts.
   - **Replays** play it back at the original timing, at 1×, 2× or 4×.
   - If the server restarts mid-race, that race is kept and marked *red-flagged*. It doesn't count toward the leaderboard.
   - Races that are created but never started are discarded after 2 minutes.
   - Answers are shown as formatted Markdown, with LaTeX maths rendered as readable text. Model output can never inject HTML.

Car position on the track comes only from real stream data:
- On the grid until the request is sent
- A slow creep while waiting for the first token
- Then a progress curve driven by tokens received
- Across the line when the response completes

The HUD speed bars show measured tokens/second. Token counts marked `~` are estimates (characters ÷ 4) when the provider didn't report usage.

## Pages

**Home**, **Garage** (3D turntable), **Race** (live circuit, HUD, team radio with the streamed text, champion reveal with trophy and podium), **Champions** (leaderboard), **Replays**, **Pit Crew** (provider status, key validation, daily and per-minute quota, cooldowns, revalidation), **Settings** (judge, weights, max tokens, timeout, system prompt, and the paid-provider toggle, which is locked unless the env setting allows it).

## Quota management

`server/src/quota.ts` handles:
- Counting this app's requests per provider (daily, rolling over at UTC midnight, and per minute)
- Applying the limits the provider reports (OpenRouter's `/api/v1/key` endpoint)
- Cooling down a single model after a 429, and pausing a whole provider after a daily-quota or auth failure

It schedules an **automatic revalidation** at the earliest known reset time (rate-limit window, quota block, or 00:00 UTC), which re-checks keys and refreshes the catalog. Pit Crew also has a manual **Revalidate now** button. State persists in `server/data/`.

## Testing

```bash
npm test                     # server + client vitest suites (all use mock providers; no network, no AI requests)
npm run build                # type-checks and builds server + client
```

What the suites cover:
- **Server:** scoring, judge parsing, quota and preflight, the SSE parser, and the full race pipeline over HTTP+SSE.
  - Also: the OpenRouter provider against recorded wire formats (streams, reasoning, real 401/402/429 error bodies), the paid lock, and the local-only security rules.
  - Also: car customization validation and persistence, abandoned races, and restart recovery.
- **Client:** lineup handling, setup guidance, liveries ("identical everywhere"), name fitting, and the safe Markdown/LaTeX renderer.

`server/test/ui-harness.ts` is a **test-only** server on port 8788.
- It runs the real race engine with scripted stub models named `TEST ALPHA (synthetic)`, `TEST BRAVO (synthetic)` and so on.
- Every page shows a yellow **TEST MODE** banner there, so it can't be mistaken for the real app.
- Start it with `npx tsx test/ui-harness.ts` from `server/`, after `npm run build -w client`.
- `npm run dev` and `npm start` never use it, and its races are never saved to `server/data`.

## Manual test checklist

1. Put `OPENROUTER_API_KEY` in `.env` and restart `npm run dev`.
2. **Pit Crew** should show OpenRouter as *key verified*, with its daily limit.
3. **Garage**: add 2–5 free models; the 3D preview changes with each selection.
4. **Race**: choose a preset prompt and press START RACE. Watch the countdown, then cars launch as their first tokens arrive, and Team Radio shows the real streamed text.
5. When the race ends, check that the champion reveal shows the judge's name and a score table. Press VIEW ANSWERS.
6. **Champions** and **Replays** should now include the race. Open the replay.
7. In Chrome DevTools, use device mode (for example iPhone 14) and repeat step 4.

## Project layout

```
server/src
  app.ts            Express routes + SSE (+ /api/liveries car customization)
  liveries.ts       customization validation (colour, number, body style, nickname)
  lib/security.ts   local-only access control (loopback Host + same-origin)
  race.ts           race engine (concurrency, events, judging, persistence)
  judge.ts          blind judge prompt + strict JSON parsing
  scoring.ts        weighted scoring + ranking
  quota.ts          quota tracking + scheduled revalidation
  catalog.ts        live model catalog + availability
  leaderboard.ts    championship aggregation
  providers/        openrouter.ts (fetch+SSE), anthropic.ts (@anthropic-ai/sdk), openai.ts (openai SDK)
client/src
  three/            Car, Track, RaceScene (chase camera, bloom), GarageScene
  components/       PaintShop (car customization), Markdown (safe answer renderer), ProviderNotice (setup guidance)
  components/race/  Countdown, Hud, Telemetry, ChampionReveal, Trophy
  store/            useArena (grid lineup), useLiveries (shared car customizations)
  pages/            Home, Garage, Race, Champions, Replays, PitCrew, Settings
  lib/              api client, race event reducer, replay/live hooks, liveries
```
