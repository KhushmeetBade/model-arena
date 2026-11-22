# Model Arena — demo video (final cut, mobile-first)

**File:** `video/Model-Arena-Demo.mp4` (in the submission ZIP; video files are not committed to Git)
**Length:** 2:45.0 exactly · **Format:** 1920×1080, 30 fps, H.264 + AAC 48 kHz stereo, −16 LUFS

## Structure
- **0:00–2:30 — mobile interface only.** The real app at an iPhone 13 viewport (390×844, rendered at 2× for sharpness)
  in Chrome's mobile emulation, shown full-height (≈1.23× real size) with section titles on the left and captions on the
  right, so captions never cover the interface. It is a responsive web app, not a native iPhone app, and the video says so.
- **2:30–2:45 — desktop interface only.** The same app in a desktop browser.
- Scenes join with 0.5 s crossfades (no black frames). The mobile→desktop crossfade starts exactly at 2:30.

## How it was made
- **Footage:** real screen recordings of the working local production build (Chrome DevTools screencast, scripted taps,
  scrolls and clicks). Data: the 11 stored genuine races; private race `c25d9535` was removed from the recording copy.
- **No AI requests:** the Race page's own quota preflight kept Start locked, and it was never pressed.
- **Narration:** macOS voice “Samantha”, one clip per sentence placed at its exact time; captions use the same timings.
- **Music:** original ambient pad synthesised with ffmpeg (no third-party audio), mixed well below the voice.
- **Verified on the exported file:** duration 165.000 s; 0 black frames (blackdetect); −16.0 LUFS; every sentence gap
  lines up with a caption boundary (silence detection); an automated pixel check of every half-second confirmed that
  only background surrounds the phone before 2:30 and desktop footage fills the frame after it; full frame-by-frame review.

## Timeline and narration
| Time | Picture (real footage) | Narration |
|---|---|---|
| 0:00.0–0:12.5 | Mobile Home (hero) — title panel | “This is Model Arena: a responsive web app, shown here at iPhone size in a mobile browser. One prompt goes to several real AI models, and a neutral AI judge decides the winner.” |
| 0:12.5–0:25.5 | Mobile Home dashboard: stats, scroll to demo and recent genuine races | “The Home dashboard shows the free competitors, races run, the last champion and the season leader. Scroll down for demo races and the most recent genuine races.” |
| 0:25.5–0:40.5 | Mobile Garage: model list scroll, tap Nemotron 3.5 Super VL, details, Paint Shop | “In the Garage, every card is a free OpenRouter model, with its real name and provider. Tap a car for its details, stats and Paint Shop: colour, number, body style and nickname.” |
| 0:40.5–0:55.5 | Mobile Race setup: prompt typed, grid, quota preflight (Start locked, not pressed) | “On the Race page, you pick up to five cars and write one prompt that every car receives. Before starting, the app checks the free quota. Today it is used up, so Start stays locked, and no new AI requests are made.” |
| 0:55.5–1:23.5 | Genuine race 348cee31 on mobile: race, HUD, Team Radio answers per model, steward judging | “So here is a genuine race, recorded with real OpenRouter inference. The prompt was: Hey love, find me the love of my life. Tokens move the cars. The HUD shows each model's position, finish time and streaming speed. Team Radio shows the actual answer each model streamed, word for word. Then the race steward, a separate AI model, starts judging.” |
| 1:23.5–1:48.5 | Mobile champion reveal, podium, judge comment + classification, View Answers (full responses) | “The judge, NVIDIA Nemotron 3 Ultra, scores accuracy, helpfulness, clarity and completeness, and that quality is combined with speed. Nemotron 3.5 Super VL wins with 95.1 points, ahead of Nemotron 3 Nano Omni and ERNIE 5.5 Flash. The judge explains its verdict, and View Answers opens every full response.” |
| 1:48.5–2:01.5 | Mobile Replays list → replay player: 2×, 4×, pause, restart | “Replays keeps every genuine race, with its winner, scores and any cars that did not finish. Each replay can be paused, restarted, or played at up to four times speed.” |
| 2:01.5–2:10.0 | Mobile Champions standings | “Champions ranks every model across all genuine races, by wins, podiums and average score.” |
| 2:10.0–2:17.5 | Mobile Pit Crew (quota, locked paid providers) | “Pit Crew shows provider status and the daily free quota. Paid providers are locked on the server.” |
| 2:17.5–2:24.0 | Mobile Settings (scoring weights, judge, race rules) | “Settings adjusts the scoring weights, the judge and the race rules.” |
| 2:24.0–2:30.0 | Bottom tab bar: tapping through all seven sections | “And the bottom tab bar reaches all seven sections with one thumb.” |
| 2:30.0–2:45.0 | DESKTOP: Home → Garage → Replays → Champions | “The same app also runs in desktop browsers, with a wider layout for larger screens. Model Arena: AI comparison you can watch.” |

## Honesty notes
- Genuine race `348cee31` (recorded 21 Nov 2026) is shown as a replay of stored real data: names, answers, scores and the
  judge's comment are the originals. No race was run for the video.
- Mobile footage is browser emulation, labelled on screen; no physical-iPhone footage is included.
