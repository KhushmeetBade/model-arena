# Model Arena — demo video (final cut)

**File:** `video/Model-Arena-Demo.mp4` (in the submission ZIP; video files are not committed to Git)
**Length:** 2:45.0 · **Format:** 1920×1080, 30 fps, H.264 + AAC 48 kHz stereo, −16 LUFS

## Story
1. **Problem (0:00–0:25)** — many models; the same question gets very different answers (shown with the *actual* answers
   from race 348cee31); comparing by hand is slow and names/benchmarks don't say which model suits your question.
2. **Model Arena (0:25–0:45)** — same prompt to several real models, head-to-head race, separate AI judge, inspectable results.
3. **AI feature (0:45–1:51)** — genuine race `348cee31` replayed from stored data: prompt, each model's Team Radio answer,
   the judge (NVIDIA Nemotron 3 Ultra — the free model the app picked because it was not racing), scores, the judge's own
   comment, the winner, complete answers, replay controls. On-screen outlines mark what is **actual model / judge output**.
4. **The app on mobile (1:51–2:24)** — Garage, Race (quota lock), Champions, Pit Crew, Settings, bottom navigation
   (Home and Replays appear earlier).
5. **Impact and limitations (2:24–2:45)** — desktop support; compare side by side and read real answers; AI judging is
   subjective decision support; models are free models accessed through OpenRouter.

## How it was made
- **Footage:** real screen recordings of the working local production build, captured with Chrome DevTools screencast
  at true 2× density. Mobile = Chrome's iPhone 13 emulation (390×664 browser viewport), shown at correct proportions
  (610×1040); it is a responsive web app, not a native iOS app, and the video says so. Desktop = 1920×1080 browser.
- **Data:** the stored genuine races; private race `c25d9535` was removed from the recording copy. The problem card quotes
  the stored answers of race 348cee31 verbatim. No race was run and no AI request was made (Start stays locked by the
  app's quota preflight and was never pressed).
- **Judge facts from the code:** `server/src/race.ts` picks the configured judge, otherwise a free model that is not
  competing; answers are anonymous (A, B, C…); four 0–10 criteria (`server/src/judge.ts`); total = 65 % quality +
  25 % speed + 10 % completion (`server/src/app.ts`, `server/src/scoring.ts`).
- **Narration:** macOS voice “Samantha”, one clip per sentence at an exact time; captions use the same timings and sit
  beside the phone (or under the desktop footage) so they never cover the interface.
- **Music:** original ambient pad synthesised with ffmpeg, mixed well below the voice. Transitions: 0.5 s crossfades.
- **Verified on the exported file:** 165.000 s; 1920×1080 at 30 fps; 0 black frames; −16.2 LUFS; every pause between
  sentences matches a caption boundary; full-length frame review at two different sampling offsets plus every transition.

## Timeline and narration
| Time | Picture (real footage / real data) | Narration |
|---|---|---|
| **1 Problem** | | |
| 0:00.0–0:07.0 | Card: the 11 free models in the Garage (“Which AI model should you use?”) | “With so many AI models available, choosing the right one isn't always easy.” |
| 0:07.0–0:15.5 | Card: the same prompt and the **actual** opening lines of two answers from race 348cee31 | “Two models can receive the exact same question, and produce very different answers.” |
| 0:15.5–0:25.0 | Card: comparing by hand — paste, read, judge; names/benchmarks don’t answer “best for my question” | “Comparing them by hand takes time, and model names or advertised benchmarks don't always tell you which model works best for your needs.” |
| **2 Introduce Model Arena** | | |
| 0:25.0–0:45.0 | Mobile Home dashboard (scrolls to stats and recent races) | “Model Arena makes that comparison visible. It is a responsive web app, shown here in a mobile browser at iPhone size.” “Several real AI models get the same prompt and race head to head. A separate AI judge evaluates every answer, and you can inspect the results yourself.” |
| **3 AI feature (genuine race)** | | |
| 0:45.0–0:52.0 | Mobile Replays list → tap genuine race 348cee31 | “Let's open a genuine race from Replays. It's a recording of real model output, not a live race.” |
| 0:52.0–1:45.0 | Genuine race replay: race → Team Radio answers per model (outlined “ACTUAL MODEL ANSWER”) → steward judging → champion reveal → judge comment + scores (outlined “ACTUAL AI JUDGE OUTPUT”) → View Answers (“COMPLETE MODEL ANSWERS”) | “The prompt was: Hey love, find me the love of my life. Three free models answered it at the same moment.” “Team Radio shows the actual answers. ERNIE asks three questions first.” “Nano Omni gives general dating tips.” “Nemotron 3.5 Super VL can't find a person, but suggests practical next steps.” “The judge for this race, NVIDIA Nemotron 3 Ultra, is a free model that was not racing. It scores each anonymous answer for accuracy, helpfulness, clarity and completeness.” “Nemotron 3.5 Super VL wins with 95.1 points, ahead of Nano Omni and ERNIE.” “These are the judge's own words, and its quality score for each model.” “Quality is sixty-five percent of the total, speed twenty-five, completion ten.” “View Answers shows every complete response, so you can check the verdict.” |
| 1:45.0–1:51.5 | Replay controls: 2×, 4×, pause, restart | “Any replay can be sped up, paused or restarted.” |
| **4 The app on mobile** | | |
| 1:51.5–1:59.5 | Mobile Garage: model list, tap Nemotron 3.5 Super VL, details, Paint Shop | “The Garage lists the free models, each with its real name, details and stats.” |
| 1:59.5–2:06.0 | Mobile Race: grid and quota preflight (Start locked, not pressed) | “One prompt goes to every car. A quota check locks Start at the free limit.” |
| 2:06.0–2:11.0 | Mobile Champions standings | “Champions ranks models across genuine races.” |
| 2:11.0–2:15.5 | Mobile Pit Crew | “Pit Crew shows the free quota.” |
| 2:15.5–2:19.5 | Mobile Settings | “Settings tunes scoring and the judge.” |
| 2:19.5–2:24.5 | Bottom tab bar through all seven sections | “A bottom tab bar reaches all seven sections.” |
| **5 Impact and limitations** | | |
| 2:24.5–2:38.5 | Desktop browser: Home → Garage → Replays → Champions | “It also runs in desktop browsers. Model Arena helps people compare AI models side by side, and read the real answers, not just a winner.” “But AI judging can be subjective, so treat it as decision support, not absolute truth.” |
| 2:38.5–2:45.0 | End card: OpenRouter free models · judging is decision support | “The models are free models accessed through OpenRouter. Model Arena: AI comparison you can watch.” |
