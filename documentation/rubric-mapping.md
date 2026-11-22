# AppFusion 2026 rubric mapping

Timestamps refer to the final 2:45 video (`video/Model-Arena-Demo.mp4`; timeline in `video/SCRIPT.md`). Evidence files are in this repository.

| # | Criterion (pts) | Application functionality | Evidence | Video | Slide / doc |
|---|---|---|---|---|---|
| A1 | App and AI work end to end (5) | Pick free models → one prompt → same prompt to every model → streamed answers → AI judge (JSON criteria) → scores → positions → champion → saved replay | 11 genuine stored races; `race.e2e.test.ts`, `cloud.test.ts`; screenshots 03, 04 | 0:45–1:51 | Slide 5; testing.md §2 |
| A2 | AI fits the problem (5) | Comparison of real model outputs; blind neutral judge; visible per-criterion scores and full answers | AI-integration.md (models, judge, scoring, limitations) | 0:00–0:25, 0:45–1:51 | Slide 4 |
| A3 | Safe and stable (5) | Free-only filter, paid lock, quota preflight, cooldowns, judge fallback, DNF reasons, access code, host guard, safe Markdown, offline banner | security.md; `safety`, `robustness`, `openrouter`, `cloud` tests; real rate-limit DNFs | 1:59–2:06 | Slide 7 |
| B1 | Problem and value (5) | Replaces manual copy-paste comparison with one prompt, side-by-side answers and a scored result | SUBMISSION.md problem/users | 0:00–0:45 | Slide 2–3 |
| B2 | Testing and next steps (5) | 74 automated tests, mobile audit, secret scan, real-race verification, documented bugs & fixes | testing.md | 2:24–2:45 | Slide 7–8 |
| C1 | Usability and accessibility (5) | Seven clear sections, empty/loading/error states, 44 px controls, labelled buttons, no overflow at 320–390 px, PWA, safe areas | testing.md §3; screenshot 05 | 0:25–2:24 (mobile) | Slide 6 |
| D1 | Original idea (5) | AI evaluation drives a motorsport visualisation: tokens move cars, the judge decides the podium; car customisation, replays, championship | screenshots 01–05 | 0:45–1:51 | Slide 6 |
| E1 | Story and delivery (5) | Problem → users → solution → AI workflow → demo → safety → testing → next steps | video/SCRIPT.md, presentation | whole video | Slides 1–8 |
| E2 | Demo video (5) | 2:45 narrated video: problem → solution → genuine AI race with labelled model/judge output → mobile app tour → impact and limitations; captions; no physical-iPhone footage | `video/Model-Arena-Demo.mp4` | whole video | — |
| E3 | Technical understanding (5) | Architecture, SSE streaming, scoring formula, persistence, security explained from source | architecture.md, judge-QA.md | 0:45–1:51 | Slide 4, 7 |
