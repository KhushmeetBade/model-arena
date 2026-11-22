# Model Arena — demo video script (target ≈ 3:50, hard limit < 5:00)

Format: 1920×1080, 16:9, MP4 (H.264 + AAC). Portrait iPhone footage placed in the centre at full height
(no stretching) over a dark blurred background. Subtitles = narration text. Subtle royalty-free/original music at low volume.

| Time | Picture (real footage only) | Narration |
|---|---|---|
| 0:00–0:20 | Home hero, cars on the neon track | “Which AI model gives the best answer? Usually you paste one prompt into five tools, read five answers and guess. Model Arena turns that into a race.” |
| 0:20–0:45 | Home stats → “Try a demo race” | “It’s for students learning about AI, developers choosing a model and educators explaining model differences. Every model gets the same prompt, a neutral AI judge scores the answers, and the scores decide the race.” |
| 0:45–1:10 | Garage: free-model list, select cars, Paint Shop (colour, number, body, nickname) | “The Garage lists only verified free OpenRouter models — every price is zero. Pick up to five, and give each car a livery; the real model name always stays visible.” |
| 1:10–1:35 | Race setup: prompt box with “Hey love, find me the love of my life.”, request budget line | “Here’s our prompt. The app shows how many free requests the race will use before you start — cars plus up to two judge attempts.” |
| 1:35–2:15 | Replay of the **genuine** stored race “Hey Love, find me the love of my live” (label on screen: “Real race recorded 21 Nov 2026”): HUD, DNFs with rate-limit reason, Team Radio text, results table, judge comment, View Answers | “This is a real race we ran earlier with that prompt. Two free models were rate-limited by their provider — the app records that honestly instead of hiding it. Nemotron 3.5 Super VL answered: it can’t find you a partner, but offered dating-profile help and first-date advice. The judge scored it ten for accuracy and explained why. You can read every answer and every score yourself.” |
| 2:15–2:45 | Demo replay “One-Minute Championship” with the DEMO badge visible: thinking phase, red flag, lead change, podium | “For exploring without using any AI quota, there are three demo races — clearly labelled simulated. They show the telemetry: time to first token, tokens per second, a red-flagged car, and a podium where quality beats raw speed.” |
| 2:45–3:15 | **iPhone screen recording** (portrait): Home → Garage → Race → Replays → Champions, install to Home Screen | “On iPhone it runs as an installable web app: big touch targets, the race HUD and replay controls fit the screen, and safe areas respect the notch.” |
| 3:15–3:40 | Architecture slide → Pit Crew page | “React, TypeScript and Three.js on the front; Node and Express stream every token with Server-Sent Events. The API key never leaves the server, paid models are locked, and Pit Crew shows key status and the free quota.” |
| 3:40–3:55 | Testing slide → Champions | “Seventy-two automated tests, ten genuine races and fixes for every issue we found. Next: custom judging criteria, multiple judges and benchmark prompt sets.” |
| 3:55–4:00 | Logo | “Model Arena — AI comparison you can watch.” |

Honesty rules: never show demo races as real; label the real race as recorded earlier; the creative prompt in the
setup panel is typed live but **not submitted** unless the owner explicitly approves a new race.

## What the owner needs to record on the iPhone (≈ 60 s)
1. Open the production URL in Safari (after deployment) → Share → **Add to Home Screen** → open from the icon.
2. Settings → Control Centre → add **Screen Recording**. Start recording (portrait, Do Not Disturb on).
3. Tap through slowly (3–4 s each): Home (scroll once) → Garage (tap a model, open Paint Shop) → Race (type the prompt,
   do **not** press Start) → Replays → open **One-Minute Championship** (let it run ~15 s) → Champions → Pit Crew.
4. Stop recording; AirDrop the video to this Mac and put it in `video/raw/iphone.mov`.
