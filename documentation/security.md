# Security, privacy and cost safety

| Risk | Protection (where in code) |
|---|---|
| API key leak | `OPENROUTER_API_KEY` lives only in the server environment (`.env` locally — git-ignored; Vercel encrypted env in production). It is never sent to the browser, logged, or committed. Git history scanned for key patterns: none found. |
| Spending money | Only `:free` models whose **every** price field is 0 are listed. Paid providers are locked by `ALLOW_PAID_PROVIDERS=false`: the Settings toggle is refused (HTTP 403), stored `allowPaid:true` is ignored, and paid providers are never contacted. OpenRouter's "add credits / own key" upsell text is stripped from errors. |
| Quota exhaustion | Quota preflight before every race (cars + up to 2 judge attempts must fit the remaining daily and per-minute free quota, else HTTP 429), re-checked at start; per-model cooldowns after 429s; provider pause after a daily-quota error; judge stops when quota is exhausted. |
| Strangers using the owner's quota (public deployment) | Live races, settings, liveries and revalidation require the owner access code (`x-arena-access` header, constant-time comparison, 8 wrong attempts → 15-minute lock per IP). A daily cap on live races (default 5). Browsing, demo races and replays stay open. |
| Other websites calling the API (CSRF / DNS rebinding) | `hostGuard`: the Host must be localhost or the deployment's own hostname; cross-site Origins and `Sec-Fetch-Site: cross-site` are refused (403); CORS only for allowed origins. Locally the server binds to 127.0.0.1 only. |
| Malicious model output | Answers are rendered by a safe Markdown renderer that builds React elements only (no raw HTML); tests confirm `<script>`/`<img onerror>` are escaped. |
| Bad input | Prompt 1–8,000 chars; 1–5 known, available models; JSON body ≤ 64 KB; customization fields strictly validated (hex colour, 1–99, chassis 0–2, nickname ≤ 18 chars, markup stripped). |
| Long-running requests | Per-car timeout (120 s local, 90 s serverless), judge timeout (90 s / 60 s); a dropped client connection does not stop the race — it is still judged and saved. |
| Storage integrity | Atomic JSON writes locally; in the cloud one private Blob with ETag-conditional writes and read-merge-retry, so two instances can't overwrite each other's races. |
| Privacy | Prompts and answers are stored only in the owner's storage (local files / private Blob). No analytics, no third-party trackers. Prompts are sent to OpenRouter and the selected model providers — users should not enter personal data. |
| Real vs simulated | The three demo races use fictional "Simulated" racers, live on separate routes, are never stored, never ranked, and are labelled "DEMO RACE — SIMULATED RESULTS" everywhere. |

Security headers on Vercel: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
