# Model Arena — AppFusion Hackathon 2026 submission

| | |
|---|---|
| **App** | Model Arena — AI Racing Championship |
| **Team** | Apex Intelligence |
| **Member** | Khushmeet Kaur Bade (sole member) |
| **Event** | AppFusion Hackathon 2026 — TRU AI Club |
| **Repository** | https://github.com/KhushmeetBade/model-arena |
| **Category (recommended)** | AI / Education & Learning tools — *verify against the official category list before submitting* |
| **Platform** | Mobile-first Progressive Web App (iPhone Safari + desktop) |

## Problem
Comparing AI models is slow and hard to see: you paste the same prompt into several tools, collect the answers,
read each one, decide which is best and try to remember how fast each was. There is no single, visual,
side-by-side view of how different models handle *your* prompt.

## Target users
Students learning how AI models differ · developers choosing a model for a task · AI enthusiasts ·
educators and researchers demonstrating model differences.

## Solution
Model Arena sends one prompt to up to five real AI models at the same moment, streams their answers live, has a
neutral AI judge score every answer blind, and turns the result into a race: tokens move the cars, the judge's
scores decide the podium. Every answer, score and judge comment can be inspected, and every race is saved as a
replay and counted in a championship.

## AI feature and service
- **Service:** OpenRouter Chat Completions, **free (`:free`, $0) models only** — 11 verified on 21 Nov 2026
  (NVIDIA Nemotron family, Google Gemma 4, Baidu ERNIE 5.5 Flash, inclusionAI Ling 3.2 Flash, Particle-1, Flint, LFM3).
- **Competitors:** the user's chosen models answer the identical prompt.
- **Judge:** a neutral free model scores accuracy, helpfulness, clarity and completeness (0–10) as strict JSON,
  with a fallback judge.
- **Why AI is central:** the product is a comparison of AI outputs, and evaluating free-text answers needs
  language understanding. The racing is a visualisation of the AI results, not decoration.

## Architecture and data flow
React 19 + TypeScript + Vite + Zustand + three.js (React Three Fiber) client → Express 5 API (Node 24) →
OpenRouter. One request runs a race and streams Server-Sent Events back; races persist to JSON files locally or a
private Vercel Blob in the cloud. Details: `documentation/architecture.md`, `documentation/AI-integration.md`.

## Testing actually completed
72 automated tests (mock providers), TypeScript checks, production build, browser tests at desktop and phone
widths, a production-mode server test, and 10 genuine AI races (including the creative prompt
“Hey Love, find me the love of my live”). Details and bugs fixed: `documentation/testing.md`.

## Improvements made during testing
Server-side paid-provider lock · whole-race quota preflight · reasoning-model token handling · judge fallback and
limits · local-only and owner-code access protection · safe Markdown rendering · leader-following race camera ·
mobile overflow fixes · simulated demo races clearly separated from real results · Vercel-ready persistence.

## Limitations
LLM judging is subjective and can be biased; results depend on prompt, criteria and the day's model availability;
free models are often rate-limited (14 of 42 car entries DNF); 50 free requests per day; physical-iPhone testing
and the public deployment are pending (see README).

## Next steps
User-defined judging criteria · multiple judges and consensus scoring · benchmark prompt sets with statistics ·
more providers · public comparison history · usability study with students.

## Development timeline and tools
- **Before 20 Nov 2026:** nothing — no code, design or repository existed.
- **During the hackathon:** the entire application was built from scratch, starting 21 Nov 2026 ≈ 2:45 PM
  (first file created 14:45; repository history from 15:40).
- **AI coding tools:** Claude Code (Anthropic) was used for AI-assisted development, debugging, testing and
  documentation. It is **not** part of the application's inference — the app's AI comes from OpenRouter free models.
