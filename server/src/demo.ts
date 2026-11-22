/**
 * Built-in DEMO races — SIMULATED RESULTS.
 *
 * These three races let a first-time visitor (or a judge) explore Model Arena without spending any
 * AI requests. They are generated deterministically in memory from a scripted timeline:
 *  - no OpenRouter (or any other) inference is involved,
 *  - the racers are fictional ("Simulated" provider), so no real model is credited with invented results,
 *  - they are never written to race storage and never counted on the leaderboard or home stats,
 *  - every record carries `demo`, and the UI labels them "DEMO RACE — SIMULATED RESULTS".
 * They are scored with the real scoring function so the podium logic is identical to live races.
 */
import { scoreCompetitors } from './scoring.js';
import type { CompetitorResult, JudgeScore, RaceEvent, RaceRecord } from './types.js';

interface SimCar {
  id: string;
  name: string;
  /** seconds after the green light at which the first token (reasoning or answer) arrives */
  ttft: number;
  /** seconds spent streaming reasoning before the answer starts */
  thinkSecs?: number;
  /** answer tokens per second */
  tps: number;
  answer: string;
  /** DNF at this second with this error (simulated) */
  dnf?: { at: number; error: string };
  judge?: JudgeScore;
}

interface SimRace {
  id: string;
  title: string;
  blurb: string;
  durationLabel: string;
  prompt: string;
  createdAt: number;
  judgeName: string;
  judgeAt: number; // seconds after the last car finishes
  judgeSecs: number;
  summary: string;
  cars: SimCar[];
}

const TICK = 0.25; // seconds between simulated progress updates (real races: ~0.12 s)
const WEIGHTS = { quality: 65, speed: 25, completion: 10 };

function simulate(sim: SimRace): RaceRecord {
  const events: RaceEvent[] = [];
  const ms = (s: number) => Math.round(s * 1000);
  const push = (t: number, type: string, data: Record<string, unknown>) => events.push({ t: ms(t), type, data });

  const competitors: CompetitorResult[] = sim.cars.map((c, lane) => ({
    modelId: `demo:${c.id}`,
    name: `Simulated: ${c.name}`,
    provider: 'demo',
    lane,
    status: 'queued',
    text: '',
    reasoningChars: 0,
    tokensEstimated: true,
  }));

  push(0, 'race.created', { competitors: competitors.map((c) => ({ lane: c.lane, modelId: c.modelId, name: c.name, provider: c.provider })) });
  push(0, 'race.start', { prompt: sim.prompt });
  competitors.forEach((c) => push(0.01 * c.lane, 'car.launch', { lane: c.lane }));

  let lastFinish = 0;
  sim.cars.forEach((car, lane) => {
    const c = competitors[lane];
    const think = car.thinkSecs ?? 0;
    const answerChars = car.answer.length;
    const answerSecs = answerChars / 4 / car.tps;
    const endAt = car.dnf ? car.dnf.at : car.ttft + think + answerSecs;
    push(car.ttft, 'car.first_token', { lane, ttftMs: ms(car.ttft) });
    let sent = 0;
    let reasoning = 0;
    for (let t = car.ttft + TICK; t < endAt + 1e-9; t += TICK) {
      const thinking = t < car.ttft + think;
      if (thinking) reasoning = Math.round(((t - car.ttft) / Math.max(think, 0.01)) * 900 * (think / 12 + 0.3));
      const target = thinking ? 0 : Math.min(answerChars, Math.round(((t - car.ttft - think) / answerSecs) * answerChars));
      const append = car.answer.slice(sent, target);
      sent = target;
      const tokens = Math.round((sent + reasoning) / 4);
      const elapsed = t - car.ttft;
      push(t, 'car.progress', {
        lane,
        append,
        tokens,
        answerChars: sent,
        reasoningChars: reasoning,
        tps: elapsed > 0.2 ? Math.round((tokens / elapsed) * 10) / 10 : 0,
        phase: sent ? 'answering' : 'thinking',
      });
    }
    c.reasoningChars = reasoning;
    c.ttftMs = ms(car.ttft);
    c.latencyMs = ms(endAt);
    if (car.dnf) {
      c.text = car.answer.slice(0, sent);
      c.status = 'dnf';
      c.error = car.dnf.error;
      push(endAt, 'car.dnf', { lane, error: car.dnf.error });
    } else {
      c.text = car.answer;
      c.status = 'finished';
      c.outputTokens = Math.round((answerChars + reasoning) / 4);
      c.tokensEstimated = false;
      c.tokensPerSec = Math.round((c.outputTokens / (endAt - car.ttft)) * 10) / 10;
      lastFinish = Math.max(lastFinish, endAt);
    }
  });

  // finish positions follow finishing time
  let finishPos = 0;
  competitors
    .filter((c) => c.status === 'finished')
    .sort((a, b) => a.latencyMs! - b.latencyMs!)
    .forEach((c) => {
      push(c.latencyMs! / 1000, 'car.finish', {
        lane: c.lane,
        position: ++finishPos,
        latencyMs: c.latencyMs,
        ttftMs: c.ttftMs,
        outputTokens: c.outputTokens,
        tokensEstimated: false,
        tps: c.tokensPerSec,
        finishReason: 'stop',
      });
    });

  const jStart = lastFinish + sim.judgeAt;
  push(jStart, 'judge.start', { judgeModel: 'demo:steward', judgeName: sim.judgeName });
  push(jStart + sim.judgeSecs, 'judge.done', { judgeModel: 'demo:steward' });
  sim.cars.forEach((car, lane) => {
    if (car.judge && competitors[lane].status === 'finished') competitors[lane].judge = car.judge;
  });
  const scored = scoreCompetitors(competitors, WEIGHTS);
  const champ = scored.find((c) => c.rank === 1 && c.status === 'finished');
  const evaluation = {
    method: 'llm-judge' as const,
    judgeModel: 'demo:steward',
    judgeName: sim.judgeName,
    summary: sim.summary,
    note: 'DEMO RACE — SIMULATED RESULTS. No AI model was called; racers, answers and scores are scripted for demonstration.',
  };
  push(jStart + sim.judgeSecs + 0.05, 'race.complete', {
    championId: champ?.modelId ?? null,
    evaluation,
    standings: scored.map((c) => ({ lane: c.lane, modelId: c.modelId, rank: c.rank, scores: c.scores, judge: c.judge ?? null, latencyMs: c.latencyMs ?? null, status: c.status })),
  });

  events.sort((a, b) => a.t - b.t);
  const end = events.at(-1)!.t;
  return {
    id: sim.id,
    prompt: sim.prompt,
    createdAt: sim.createdAt,
    startedAt: sim.createdAt,
    finishedAt: sim.createdAt + end,
    status: 'complete',
    competitors: scored,
    evaluation,
    championId: champ?.modelId,
    weights: WEIGHTS,
    events,
    demo: { title: sim.title, blurb: sim.blurb, durationLabel: sim.durationLabel },
  };
}

const J = (accuracy: number, helpfulness: number, clarity: number, completeness: number, comment: string): JudgeScore => ({ accuracy, helpfulness, clarity, completeness, comment });

const SIMS: SimRace[] = [
  {
    id: 'demo-quick-sprint',
    title: 'Quick Sprint',
    blurb: 'A short three-car dash with a clear winner — the fastest way to see a full race, verdict and podium.',
    durationLabel: '≈ 10 s',
    prompt: 'In two sentences, explain what a black hole is to a curious 12-year-old.',
    createdAt: Date.UTC(2026, 10, 21, 18, 0),
    judgeName: 'Simulated Steward',
    judgeAt: 0.6,
    judgeSecs: 2.4,
    summary: 'Aurora is accurate, vivid and pitched perfectly for a 12-year-old; Quasar is correct but dry; Helix over-explains.',
    cars: [
      {
        id: 'aurora-8b', name: 'Aurora 8B', ttft: 0.45, tps: 18,
        answer: 'A black hole is a place in space where gravity is so strong that nothing — not even light — can escape once it gets too close. It forms when a huge star collapses into a tiny point, squeezing so much stuff into such a small space that it bends space itself, like a bowling ball sinking into a trampoline.',
        judge: J(10, 10, 9, 9, 'Accurate, vivid analogy, perfect for the age group.'),
      },
      {
        id: 'quasar-mini', name: 'Quasar Mini', ttft: 0.3, tps: 16,
        answer: 'A black hole is a region of space with gravity so strong that light cannot escape it. Black holes form when very massive stars collapse at the end of their lives.',
        judge: J(8, 6, 7, 6, 'Correct and fast, but a little dry for a 12-year-old.'),
      },
      {
        id: 'helix-32b', name: 'Helix 32B', ttft: 1.1, tps: 14,
        answer: "Imagine squeezing a mountain into a grain of sand — that's how packed a black hole is, so its gravity pulls in everything nearby, even light, which is why it looks completely black. Scientists find them by watching how stars and glowing gas swirl around something they can't see, and the edge you can't come back from is called the event horizon.",
        judge: J(9, 8, 7, 8, 'Good imagery but runs past the two-sentence feel.'),
      },
    ],
  },
  {
    id: 'demo-one-minute',
    title: 'One-Minute Championship',
    blurb: 'A full ≈60-second race: a reasoning model thinks before it launches, one car is red-flagged, the lead changes and the steward deliberates before the podium.',
    durationLabel: '≈ 60 s',
    prompt: 'Plan a 3-day budget trip to Tokyo for a student: a day-by-day itinerary, estimated costs in USD, and two money-saving tips.',
    createdAt: Date.UTC(2026, 10, 21, 18, 30),
    judgeName: 'Simulated Steward',
    judgeAt: 1.5,
    judgeSecs: 7,
    summary: 'Vega thought first and delivered the most complete, well-costed plan; Nimbus was faster but thinner on costs; Aurora was quick but vague.',
    cars: [
      {
        id: 'vega-reasoner', name: 'Vega Reasoner', ttft: 2.2, thinkSecs: 15, tps: 6.2,
        answer: "## Day 1 — Asakusa & Ueno\n- Senso-ji temple and Nakamise street snacks (free entry, ~$8 food)\n- Ueno Park and Ameyoko market (~$10 lunch)\n- Evening: Akihabara arcades (~$10)\n\n## Day 2 — Shibuya & Harajuku\n- Meiji Shrine (free) and Takeshita Street (~$12)\n- Shibuya Crossing and Hachiko statue (free)\n- Dinner: conveyor-belt sushi (~$15)\n\n## Day 3 — Shinjuku\n- Tokyo Metropolitan Government Building observation deck (free)\n- Shinjuku Gyoen garden (~$4)\n- Omoide Yokocho for yakitori (~$15)\n\n**Estimated total (excl. flights):** hostel 3 nights ~$90, food ~$75, transport ~$25 (72-hour subway ticket ~$10), activities ~$30 — **about $220.**\n\n**Money-saving tips**\n1. Buy the 72-hour Tokyo Subway Ticket instead of single fares.\n2. Eat breakfast and lunch from konbini (convenience stores) — good, cheap and everywhere.",
        judge: J(9, 10, 9, 10, 'Complete itinerary, realistic costs, both tips useful.'),
      },
      {
        id: 'nimbus-70b', name: 'Nimbus 70B', ttft: 0.9, tps: 3.4,
        answer: "**Day 1:** Asakusa (Senso-ji), Ueno Park, Akihabara.\n**Day 2:** Harajuku, Meiji Shrine, Shibuya Crossing.\n**Day 3:** Shinjuku Gyoen, Tokyo Metropolitan Building views, Golden Gai.\n\n**Costs:** hostel ~$30/night, food ~$25/day, transport ~$10/day — roughly **$200 total**.\n\n**Tips:**\n1. Get a 72-hour subway pass.\n2. Visit free viewpoints and shrines instead of paid towers.",
        judge: J(9, 8, 9, 7, 'Clear and correct, but costs are rough and less detailed.'),
      },
      {
        id: 'aurora-8b', name: 'Aurora 8B', ttft: 0.5, tps: 3,
        answer: 'Day 1: explore Asakusa and Akihabara. Day 2: Shibuya and Harajuku. Day 3: Shinjuku and a park. Budget about $50–70 per day for food, transport and a hostel. Tips: use a transit pass and eat at convenience stores.',
        judge: J(8, 6, 8, 5, 'Fast but vague — little real costing.'),
      },
      {
        id: 'helix-32b', name: 'Helix 32B', ttft: 1.4, tps: 4,
        answer: "Here's a student-friendly plan.\n\n**Day 1 — Old Tokyo.** Start at Senso-ji in Asakusa early to beat the crowds, then walk the Sumida River towards the Tokyo Skytree area (just look — the deck costs ~$20). Afternoon in Ueno Park and the Ameyoko market for street food.\n\n**Day 2 — Pop culture.** Harajuku in the morning, then Shibuya Crossing at sunset and a cheap ramen dinner in the side streets. Budget roughly $35 for the day including the subway.\n\n**Day 3 — Shinjuku.**",
        dnf: { at: 44, error: 'simulated: provider rate limit (429) — red-flagged' },
      },
    ],
  },
  {
    id: 'demo-championship',
    title: 'Championship Challenge',
    blurb: 'Five cars, close scores and a detailed classification — quality beats raw speed in a coding showdown.',
    durationLabel: '≈ 24 s',
    prompt: 'Write a Python function is_palindrome(s) that ignores case, spaces and punctuation, plus three quick tests.',
    createdAt: Date.UTC(2026, 10, 21, 19, 0),
    judgeName: 'Simulated Steward',
    judgeAt: 1,
    judgeSecs: 4,
    summary: 'Helix and Vega both wrote correct, tested solutions; Helix edged it on clarity. Quasar was fastest but ignored punctuation.',
    cars: [
      {
        id: 'quasar-mini', name: 'Quasar Mini', ttft: 0.25, tps: 14,
        answer: "```python\ndef is_palindrome(s):\n    s = s.lower().replace(' ', '')\n    return s == s[::-1]\n\nassert is_palindrome('Race car')\nassert not is_palindrome('hello')\nassert is_palindrome('a')\n```\nThis lowercases the string, removes spaces and compares it with its reverse.",
        judge: J(6, 7, 8, 6, 'Fast, but punctuation is not ignored as asked.'),
      },
      {
        id: 'helix-32b', name: 'Helix 32B', ttft: 0.8, tps: 9,
        answer: "```python\nimport re\n\ndef is_palindrome(s: str) -> bool:\n    \"\"\"True if s reads the same backwards, ignoring case, spaces and punctuation.\"\"\"\n    cleaned = re.sub(r'[^a-z0-9]', '', s.lower())\n    return cleaned == cleaned[::-1]\n\nassert is_palindrome('A man, a plan, a canal: Panama!')\nassert is_palindrome('No lemon, no melon')\nassert not is_palindrome('Model Arena')\n```\n`re.sub` strips everything that isn't a letter or digit, so case, spaces and punctuation are all ignored.",
        judge: J(10, 10, 10, 9, 'Correct, typed, documented and tested on punctuation.'),
      },
      {
        id: 'vega-reasoner', name: 'Vega Reasoner', ttft: 1.6, thinkSecs: 6, tps: 8,
        answer: "```python\ndef is_palindrome(s: str) -> bool:\n    chars = [c.lower() for c in s if c.isalnum()]\n    return chars == chars[::-1]\n\nassert is_palindrome(\"Was it a car or a cat I saw?\")\nassert is_palindrome(\"\")  # empty string counts\nassert not is_palindrome(\"palindrome\")\n```\n`isalnum()` keeps only letters and digits, which also handles accented letters.",
        judge: J(10, 9, 9, 9, 'Correct and handles the empty-string edge case.'),
      },
      {
        id: 'nimbus-70b', name: 'Nimbus 70B', ttft: 0.6, tps: 8,
        answer: "```python\nimport string\n\ndef is_palindrome(s):\n    s = ''.join(ch for ch in s.lower() if ch not in string.punctuation and ch != ' ')\n    return s == s[::-1]\n\nprint(is_palindrome('Step on no pets'))   # True\nprint(is_palindrome('Hello, world'))      # False\nprint(is_palindrome('Madam, I’m Adam'))   # True\n```",
        judge: J(8, 8, 8, 8, 'Works for ASCII; curly apostrophes slip through.'),
      },
      {
        id: 'aurora-8b', name: 'Aurora 8B', ttft: 0.4, tps: 10,
        answer: "```python\ndef is_palindrome(s):\n    t = ''.join(filter(str.isalnum, s)).lower()\n    return t == t[::-1]\n```\nTests: `is_palindrome('Taco cat')` → True, `is_palindrome('abc')` → False, `is_palindrome('12321')` → True.",
        judge: J(9, 7, 8, 7, 'Correct, but the tests are prose rather than runnable.'),
      },
    ],
  },
];

let cache: RaceRecord[] | null = null;

/** The three built-in demo races (simulated). Generated once, deterministically. */
export function demoRaces(): RaceRecord[] {
  cache ??= SIMS.map(simulate);
  return cache;
}

export function demoRace(id: string): RaceRecord | undefined {
  return demoRaces().find((r) => r.id === id);
}
