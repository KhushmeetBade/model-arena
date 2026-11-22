# Model Arena — demo video (final cut)

**File:** `video/Model-Arena-Demo.mp4` (in the submission ZIP; not committed to Git because it is larger than GitHub's 100 MB limit)
**Length:** 2:45 · **Format:** 1920×1080, 30 fps, H.264 + AAC 48 kHz stereo, −16 LUFS

## How it was made
- **Footage:** real screen recordings of the working app (local production build), captured with Chrome DevTools
  screencast at 55–60 fps and scripted with Playwright clicks and scrolls. No mock-ups, no edited results.
- **Data:** the 11 stored genuine races. The private race `c25d9535` was removed from the recording copy.
- **No AI requests** were made while recording: the Race page's own quota preflight disabled Start, and it was never pressed.
- **Narration:** macOS text-to-speech (voice “Samantha”), one clip per sentence so captions are exactly in sync.
- **Captions, labels, title cards:** rendered as images and overlaid. On-screen labels state provenance:
  “GENUINE RACE · real OpenRouter inference”, “SIMULATED DEMO RACE · no AI requests”,
  “MOBILE · Chrome mobile emulation — not a physical iPhone”.
- **Music:** an original ambient pad synthesised with ffmpeg (no third-party audio), mixed well below the voice.
- **Verified:** full-length frame review (one frame every 3 s), loudness −16.1 LUFS, and every speech segment detected
  at its caption time (silence detection, ±0.1 s).

## Timeline and narration
| Time | Picture (real footage) | Narration |
|---|---|---|
| 0:00–0:05 | Title card | “Model Arena. AI comparison you can watch.” |
| 0:05–0:18 | Home: 3D hero, stats, demo and recent-race cards | “Which AI model gives the best answer? Normally you paste one prompt into several tools and guess. Model Arena turns that comparison into a race. This is the real app, with its saved race history.” |
| 0:18–0:33 | Garage: free-model cards, select Nemotron 3.5 Super VL, Paint Shop | “The Garage lists eleven free OpenRouter models, each costing zero dollars, with the real model name on every card. Up to five cars join the grid, and the Paint Shop sets colour, number and nickname.” |
| 0:33–0:48 | Race: prompt typed, starting grid, quota preflight blocks the race (Start not pressed) | “One prompt is sent identically to every car. Before starting, the app checks the free quota, including the judge. Today it is nearly used up, so the race is blocked with a clear reason. No new AI requests are made in this video.” |
| 0:48–1:07 | Genuine race 348cee31 replay: cars, HUD, judging, Team Radio answers (pause/resume) | “This is a genuine race, recorded on November twenty-first with real OpenRouter inference. The prompt: Hey love, find me the love of my life. Tokens move the cars, and Team Radio shows each model's actual streamed answer.” |
| 1:07–1:28 | Champion reveal, podium, classification table, judge comment | “A neutral judge, NVIDIA Nemotron 3 Ultra, scores accuracy, helpfulness, clarity and completeness, combined with speed into a total. Nemotron 3.5 Super VL won with 95.1 points, ahead of Nemotron 3 Nano Omni and ERNIE 5.5 Flash, and the judge explains why.” |
| 1:28–1:34 | View Answers: full genuine responses | “View Answers shows every full response, so you can check the verdict.” |
| 1:34–1:45 | Replays archive: 11 genuine races, demo section | “Replays archives eleven genuine races, including cars that were rate limited and did not finish. Demo races sit in a separate section.” |
| 1:45–1:57 | One-Minute Championship (SIMULATED badge) at 2× | “The One-Minute Championship is simulated, makes no AI requests, and is always labelled. It lets anyone explore the app without using quota.” |
| 1:57–2:04 | Champions standings | “Champions turns genuine races into season standings. Demo races never count.” |
| 2:04–2:15 | Pit Crew (quota, locked paid providers) → Settings | “Pit Crew shows provider status and the free quota. Keys stay on the server and paid providers are hard locked. Settings tunes scoring, the judge and race rules.” |
| 2:15–2:26 | Chrome mobile emulation (iPhone 13 size): Home → bottom tab bar → genuine replay | “It is mobile first. This is Chrome mobile emulation, not a physical iPhone. A bottom tab bar reaches every section, and replays fit the screen.” |
| 2:26–2:38 | How-it-works card (architecture, 74 tests) | “React, TypeScript and three.js on the client; Node and Express stream every token with server-sent events. Seventy-four automated tests cover scoring, safety, quotas and streaming.” |
| 2:38–2:45 | End card | “Model Arena. One prompt, real models, a verdict you can see.” |

## Honesty notes
- The genuine race shown is `348cee31`, recorded 21 Nov 2026; all names, answers, scores and the judge's comment are the stored originals.
- The One-Minute Championship is a scripted demo race with fictional racers, and is labelled simulated throughout.
- The mobile segment is browser emulation, and says so on screen. Physical-iPhone footage is not included.
