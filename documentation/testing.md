# Testing report

All numbers below come from commands actually run on 21–22 Nov 2026. Automated tests use mock providers only —
no automated test ever calls a real AI model.

## 1. Automated tests — 72 passing (11 files)

| Suite | File | What it proves |
|---|---|---|
| Server | `unit.test.ts` | Scoring/ranking, judge JSON parsing (fences, think tags, clamping), quota caps & cooldowns, SSE parser |
| Server | `race.e2e.test.ts` | Full race over HTTP + SSE: concurrent streams, DNF, judge, scoring, champion, persistence, replay |
| Server | `safety.test.ts` | Free-only filter, paid lock (Settings cannot override), quota preflight, judge limits, missing-key guidance |
| Server | `openrouter.test.ts` | Provider against recorded OpenRouter wire formats: streaming, reasoning, 401/402/404/429/503, mid-stream errors |
| Server | `robustness.test.ts` | Host/origin security, abandoned races, restart mid-race, error-message sanitising |
| Server | `liveries.test.ts` | Car customization validation, persistence across restart, reset |
| Server | `demo.test.ts` | Demo durations, labelling, real scoring, isolation from real results and storage |
| Server | `cloud.test.ts` | One-request streamed race, invalid input, owner access code, daily cap, wrong-code lockout, Blob persistence across instances, concurrent-write merge |
| Client | `lineup.test.ts` | Unavailable cars stay on the grid, setup guidance, budget label |
| Client | `livery.test.ts` | Customised car identical everywhere, word-boundary name fitting |
| Client | `Markdown.test.ts` | Safe Markdown/LaTeX rendering, HTML injection escaped |

Commands: `npm test` (server 55 + client 17), TypeScript `tsc --noEmit` for server and client (0 errors),
`npm run build` (exit 0).

## 2. Real AI testing (manual, genuine OpenRouter inference)
- First controlled race (bat-and-ball puzzle): 2 cars, 4 requests. Nemotron 3.5 Lightning vs ERNIE 5.5 Flash;
  ERNIE won 100 vs 91.9. The first judge (Gemma 4 31B) was rate-limited upstream; the fallback judge
  (Nemotron 3 Ultra) returned a valid verdict — fallback verified in production conditions.
- In total 10 genuine races are stored (9 judged by an LLM judge, 42 car entries, 14 DNFs — mostly
  upstream `429` rate limits on free models), including the creative prompt
  “Hey Love, find me the love of my live”: Nemotron 3.5 Super VL won (93.5) with a responsible answer;
  Gemma 4 26B and Ling 3.2 Flash were rate-limited and recorded as DNF.
- Persistence verified by fully stopping and restarting the server: races, leaderboard, quota and settings survived.

## 3. Browser testing (real Chromium via Playwright)
- All seven sections at 1440×900 and 390×844; horizontal-overflow measurement on every page.
- End-to-end UI flow on the synthetic test harness (TEST MODE banner): customise car → race → HUD → judge →
  podium → answers → replay 4× → Champions → Replays → Home stats.
- Production build served by the production server: every route, assets, API, security rules; 0 console errors.
- Physical iPhone testing: **not yet performed** (emulated phone widths only).

## 4. Issues found and fixed (examples)
| Found | How | Fix |
|---|---|---|
| “No competitors available” although the key was set | Process/log inspection | Server had started before `.env` existed; added auto-restart on `.env` change + restart guidance |
| Settings could enable paid providers | Audit | Server-side lock; 403 + tests |
| Race could run out of quota mid-race | Audit | Whole-race quota preflight + re-check at start |
| Free models spent the whole budget “thinking” | Model metadata check before the real race | `reasoning: {effort: "low"}`, 1,000-token default, explicit DNF reason |
| Any website / LAN device could start races | Audit | Host + origin guard, loopback binding, owner access code |
| Raw `**markdown**` and `\( LaTeX \)` in answers | First real race | Safe Markdown/LaTeX renderer |
| Camera lost the cars; name tags missing; React root errors | Replay of the real race | Leader-following camera; projected DOM name tags |
| Cards overflowing 390 px screens | Overflow measurement | `min-w-0` on grid items |
| Name cut mid-word / dropped a whole word | Unit test | Fixed `fitName` |
| Concurrent first write to Blob could lose a race | Unit test (`cloud.test.ts`) | Read-merge before unconditional writes |

## 5. Not tested / limitations
- Physical iPhone and installed-PWA behaviour (needs the owner's device).
- Public Vercel deployment (blocked on account authorisation — see README).
- Long-term free-model availability (outside our control).
