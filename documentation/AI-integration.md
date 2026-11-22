# AI integration

## Why AI is central
Model Arena *is* an AI comparison tool: the race results are produced by real model responses and an AI
evaluation. Without AI there is nothing to compare — the racing visualisation only displays what the models
and the judge did.

## Provider: OpenRouter (free models only)
- One OpenAI-compatible API in front of many model families, so several vendors' models can answer the same
  prompt through one integration (`server/src/providers/openrouter.ts`).
- The catalog is read live from `https://openrouter.ai/api/v1/models`. A model is kept only if its id ends in
  `:free`, **every** pricing field is exactly `0`, and it outputs text. Routers and music models are excluded.
- Verified on 21 Nov 2026: 11 free models — NVIDIA Nemotron 3 Ultra, Nemotron 3.5 Super VL, Nemotron 3.5
  Lightning, Nemotron 3 Nano Omni; Google Gemma 4 31B, Gemma 4 26B A4B; Baidu ERNIE 5.5 Flash Preview;
  inclusionAI Ling 3.2 Flash; Particle AI Particle-1; Recursive Flint; LiquidAI LFM3-1.7B.
  **Free availability, pricing and limits are set by OpenRouter and can change at any time.**
- Free-tier limits documented by OpenRouter and enforced by the app: 20 requests/min, 50 requests/day
  (1,000/day after $10 of purchased credit — never purchased). Paid providers (Anthropic, OpenAI SDKs exist in
  the code) are hard-locked by `ALLOW_PAID_PROVIDERS=false` and are never contacted.

## Prompt distribution — fairness
Every competitor receives the identical user prompt and the identical system prompt
("Answer the user directly and accurately. Be concise but complete."), the same `max_tokens` (1,000 by default)
and the same request settings, sent concurrently. All 11 current free models support OpenRouter's `reasoning`
parameter, so every one of them is asked for `reasoning: {effort: "low"}` to leave the token budget for the answer.

## Response collection
Responses are streamed. The app records time-to-first-token, total latency, tokens (reported by OpenRouter when
available, otherwise estimated and marked `~`) and tokens/second, and keeps reasoning text separate from the answer.
Errors become a **DNF** with the reason (rate limit, timeout, empty answer, “spent its whole budget reasoning”).

## The AI judge ("race steward")
- **Model choice:** a free model that is *not* racing (neutral); if none is available, a finished competitor
  (results then carry a bias warning). Maximum 2 attempts, 1,500 output tokens each, stops early if the free
  quota is exhausted. You can also pin a judge model in Settings.
- **Blind evaluation:** answers are labelled A, B, C… in lane order — the judge never sees model names.
- **Criteria:** accuracy, helpfulness, clarity, completeness, each an integer 0–10, plus a one-sentence comment
  per answer and a short comparison summary. The reply must be strict JSON; it is validated
  (`server/src/judge.ts`) and a malformed reply triggers the fallback judge.

## Scoring (`server/src/scoring.ts`)
- **Quality** = mean of the four criteria × 10 (0–100).
- **Speed** = fastest finisher's latency ÷ this car's latency × 100.
- **Completion** = 100 for a non-empty finished answer; a DNF scores 0 on everything.
- **Total** = weighted mean, default 65 % quality, 25 % speed, 10 % completion (editable in Settings).
  If no judge verdict exists, quality is dropped and the results say so. Ties go to the lower latency.

## Users stay in control
- Every individual answer is visible (Team Radio during the race, “View answers” in results and replays).
- The judge’s per-criterion scores and comment are shown for each car, so a user can disagree with the verdict.
- Weights and the judge model can be changed in Settings.

## Limitations (stated honestly)
- An LLM judge is an evaluation aid, not ground truth: it can be biased (length, style, its own model family) and
  is subjective on open-ended prompts. Blind labels and a neutral judge reduce, but do not remove, bias.
- Results depend on the prompt, the criteria, the judge model and model availability on that day — they are not
  universal rankings. Small samples (a few races) say little about overall model quality.
- Free models are frequently rate-limited upstream: 14 of 45 car entries in our 11 real races were DNFs,
  mostly `429 temporarily rate-limited upstream`. The app records these honestly.
- Speed reflects OpenRouter routing and provider load at that moment, not only the model.
