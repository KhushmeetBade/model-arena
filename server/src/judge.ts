import { JudgeScore } from './types.js';

export const JUDGE_SYSTEM =
  'You are an impartial, strict evaluator of AI assistant answers. You grade answers to the same prompt. ' +
  'You never favor length for its own sake. You output only valid JSON.';

export function buildJudgePrompt(prompt: string, answers: { label: string; text: string }[]): string {
  const blocks = answers
    .map((a) => `<answer id="${a.label}">\n${a.text.slice(0, 6000)}\n</answer>`)
    .join('\n\n');
  return `Evaluate each anonymous answer to the user prompt below.

<prompt>
${prompt}
</prompt>

${blocks}

Score every answer on four criteria, each an integer from 0 to 10:
- accuracy: factual and logical correctness
- helpfulness: how well it actually addresses what was asked
- clarity: organization and readability
- completeness: covers what is needed without padding

Respond with ONLY a JSON object of this exact shape (no markdown fences, no prose):
{"scores":{${answers.map((a) => `"${a.label}":{"accuracy":0,"helpfulness":0,"clarity":0,"completeness":0,"comment":"one short sentence"}`).join(',')}},"summary":"one or two sentences comparing the answers"}`;
}

/** Extracts and validates the judge JSON. Throws if any required answer is missing. */
export function parseJudgeResponse(raw: string, labels: string[]): { scores: Record<string, JudgeScore>; summary: string } {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('judge returned no JSON');
  const json = JSON.parse(cleaned.slice(start, end + 1));
  const src = json.scores ?? json;
  const num = (v: unknown) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error('judge returned a non-numeric score');
    return Math.max(0, Math.min(10, n));
  };
  const scores: Record<string, JudgeScore> = {};
  for (const label of labels) {
    const s = src[label];
    if (!s) throw new Error(`judge omitted answer ${label}`);
    scores[label] = {
      accuracy: num(s.accuracy),
      helpfulness: num(s.helpfulness),
      clarity: num(s.clarity),
      completeness: num(s.completeness),
      comment: String(s.comment ?? '').slice(0, 300),
    };
  }
  return { scores, summary: String(json.summary ?? '').slice(0, 600) };
}
