/**
 * TEST-ONLY UI harness. Runs the real app (race engine, SSE, judge, scoring) on port 8788
 * with a scripted stub provider so the racing UI can be verified without API keys.
 * Not used by `npm run dev` / `npm start`. Responses here are obviously synthetic test fixtures.
 *   npx tsx server/test/ui-harness.ts   (after `npm run build -w client`)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import type { ModelInfo, Provider, StreamArgs } from '../src/types.js';

const CARS: Record<string, { ttft: number; wordMs: number; words: number }> = {
  'test-alpha': { ttft: 400, wordMs: 25, words: 120 },
  'test-bravo': { ttft: 1200, wordMs: 18, words: 160 },
  'test-charlie': { ttft: 700, wordMs: 45, words: 90 },
  'test-delta': { ttft: 2000, wordMs: 30, words: 60 },
};

class HarnessProvider implements Provider {
  id = 'openrouter' as const;
  label = 'UI test harness';
  billing = 'free' as const;
  keyEnvVar = 'NONE';
  isConfigured() { return true; }
  async listModels(): Promise<ModelInfo[]> {
    return [...Object.keys(CARS), 'test-judge'].map((n) => ({ id: `openrouter:${n}`, provider: 'openrouter', providerModel: n, name: `Test: ${n.replace('test-', '').toUpperCase()}`, free: true, available: true }));
  }
  async stream(a: StreamArgs) {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    if (a.model === 'test-judge') {
      await wait(1500);
      const labels = [...a.prompt.matchAll(/<answer id="(\w)">/g)].map((m) => m[1]);
      const scores = Object.fromEntries(labels.map((l, i) => [l, { accuracy: 9 - i, helpfulness: 8, clarity: 7 + (i % 2), completeness: 8 - i, comment: `test fixture answer ${l}` }]));
      return { text: JSON.stringify({ scores, summary: 'Test harness verdict (synthetic).' }) };
    }
    const c = CARS[a.model];
    await wait(c.ttft);
    let text = '';
    for (let i = 0; i < c.words; i++) {
      const w = `word${i} `;
      text += w;
      a.onDelta(w);
      await wait(c.wordMs * (0.6 + Math.random() * 0.8));
    }
    return { text, outputTokens: c.words * 2 };
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-ui-'));
const { app } = createApp({ dataDir: dir, providers: [new HarnessProvider()], serveClient: true });
app.listen(8788, () => console.log('UI harness on http://localhost:8788 (synthetic test data)'));
