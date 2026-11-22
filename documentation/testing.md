# Testing report

All numbers below come from commands actually run on 21–22 Nov 2026. Automated tests use mock providers only —
no automated test ever calls a real AI model.

## 1. Automated tests — 74 passing (11 files)

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

Commands: `npm test` (server 57 + client 17), TypeScript `tsc --noEmit` for server and client (0 errors),
`npm run build` (exit 0).

## 2. Real AI testing (manual, genuine OpenRouter inference)
- First controlled race (bat-and-ball puzzle): 2 cars, 4 requests. Nemotron 3.5 Lightning vs ERNIE 5.5 Flash;
  ERNIE won 100 vs 91.9. The first judge (Gemma 4 31B) was rate-limited upstream; the fallback judge
  (Nemotron 3 Ultra) returned a valid verdict — fallback verified in production conditions.
- 11 genuine races are used for the submission (10 decided by the LLM judge, 45 car entries, 31 finished, 14 DNFs —
  mostly upstream `429` rate limits on free models). A 12th genuine race exists locally but is excluded from every
  public artefact because its prompt is the owner's private notes.
- Featured race `348cee31` (“Hey love, find me the love of my life.”): 3 cars, all finished; Nemotron 3.5 Super VL won
  95.1 (quality 92.5, speed 100), Nemotron 3 Nano Omni 87.0, ERNIE-5.5-Flash-Preview 85.4; judge NVIDIA Nemotron 3 Ultra.
- Persistence verified by fully stopping and restarting the server: races, leaderboard, quota and settings survived.

## 3. Browser testing (real Chromium via Playwright)
- All seven sections at 1440×900 and 390×844; horizontal-overflow measurement on every page.
- End-to-end UI flow on the synthetic test harness (TEST MODE banner): customise car → race → HUD → judge →
  podium → answers → replay 4× → Champions → Replays → Home stats.
- Production build served by the production server: every route, assets, API, security rules; 0 console errors.
- **Mobile audit (22 Nov 2026, Chrome mobile emulation — not a physical device):** every section (Home, Garage, Race,
  Replays + genuine replay player + demo player, Champions, Pit Crew, Settings) at iPhone 13 (390×844) and iPhone SE
  (320×568): 0 horizontal overflow, 0 console errors, bottom tab bar reaches all seven sections.
  Found and fixed: text links and buttons under 44 px (All replays, Open garage, Refresh catalog, Save, Revalidate,
  Paint Shop save/custom colour → 44 px); on 320 px the Race panel's sticky Start area let scrolled text show through
  (now a solid footer). Remaining minor items: header logo link 28 px tall, text inputs 38 px, some <11 px metadata text.
- Physical iPhone testing: **not yet performed**. The production URL (HTTPS, access-code protected) is the safe way to
  test on a real iPhone; the local server is deliberately loopback-only and is not exposed to the LAN.

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
| Stale “auth failed” message after a key was fixed | Production check | Successful validation clears the old error |
| Controls under 44 px; sticky Start bled through on 320 px | Mobile audit | 44 px targets; solid sticky footer |

## 5. Not tested / limitations
- Physical iPhone and installed-PWA behaviour (needs the owner's device).
- Production (`model-arena-lake.vercel.app`): deployed and healthy, OpenRouter key verified, paid providers locked.
  Its race history is empty: importing the genuine races needs the production owner code, which could not be recovered.

## 6. Repository and release checks (22 Nov 2026)
- Secret scan of all tracked files **and the full Git history**: 0 OpenRouter/Anthropic/OpenAI/Blob key patterns,
  0 private keys, 0 occurrences of the local key or access-code values.
- `.env`, `.env.*`, `server/data/` (race history, quota), `node_modules`, build output, video files and the ZIP are ignored.
- Demo video (mobile-first cut): exactly 165.000 s; 0 black frames; −16.0 LUFS; narration gaps match caption boundaries;
  automated pixel check: mobile-only until 2:30, desktop-only after; full frame review.
- Long-term free-model availability (outside our control).
