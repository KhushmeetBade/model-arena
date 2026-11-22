# Judge Q&A preparation

1. **Why this problem?** Comparing AI models means pasting the same prompt into several tools, reading every answer and judging them by hand. Model Arena does it in one place, side by side, and makes the result easy to see.
2. **Why is AI necessary?** The product *is* a comparison of AI outputs; the evaluation of free-text answers also needs language understanding, which a rule-based checker can't do for open prompts.
3. **Identical prompts?** One request fans out to every car with the same user prompt, system prompt, token limit and reasoning setting, concurrently (`RaceEngine.run` → `Promise.all(drive…)`).
4. **How does the judge work?** A neutral free model that isn't racing receives anonymised answers (A, B, C…) and must return strict JSON: accuracy, helpfulness, clarity, completeness (0–10) + a comment. Invalid JSON → fallback judge (max 2 attempts).
5. **Scores?** Quality = mean criteria × 10; speed = fastest latency ÷ own latency × 100; completion = 100 or 0. Total = 65/25/10 weighted (editable). DNF = 0.
6. **Judge bias?** Blind labels, a neutral judge (not a competitor), fixed criteria, visible per-criterion scores and full answers so users can disagree. Bias isn't eliminated — we say so.
7. **Rate-limited model?** It's recorded as DNF with the reason, gets a cooldown, and the race continues; the judge falls back; the whole race is pre-checked against the free quota.
8. **All free?** Yes — only `:free` models with every price field = 0, checked live; paid providers are locked and never contacted. Free availability can change.
9. **API keys?** Server-side only (`.env` / Vercel encrypted env), never sent to the browser or committed.
10. **Real vs simulated?** 10 stored races are genuine OpenRouter inference. The three demo races are scripted, use fictional racers, are labelled “DEMO RACE — SIMULATED RESULTS”, and never count in Champions.
11. **Three.js link?** Car progress is computed from the stream (first token, token count, finish); the podium comes from the judge-based scores.
12. **Limitations?** Judge subjectivity, small samples, free-model rate limits (14 of 45 entries DNF), speed depends on provider load, 50 free requests/day.
13. **Next?** User-defined criteria, multiple judges/consensus, benchmark prompt sets with statistics, more providers, usability study.
14. **Testing?** 74 automated tests (mock providers), TypeScript and build checks, browser tests at desktop/phone widths, 11 genuine races, restart-persistence test.
15. **Built during the hackathon?** Everything — project created 21 Nov 2026 ~2:45 PM. Claude Code was used for AI-assisted development, debugging, testing and documentation; it is not part of the app's inference.
