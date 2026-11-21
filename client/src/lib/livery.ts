/** Deterministic, original vehicle liveries derived from a model id. */
const PALETTE: [string, string][] = [
  ['#ff2bd6', '#22e5ff'],
  ['#22e5ff', '#b6ff3b'],
  ['#ffb627', '#ff2bd6'],
  ['#8b5cff', '#22e5ff'],
  ['#b6ff3b', '#8b5cff'],
  ['#ff4d4d', '#ffb627'],
  ['#3bffb1', '#ff2bd6'],
  ['#4d7cff', '#ffb627'],
];
const CHASSIS = ['VORTEX', 'SPECTRE', 'HALCYON'] as const;
export type ChassisKind = 0 | 1 | 2;

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface Livery {
  primary: string;
  accent: string;
  chassis: ChassisKind;
  chassisName: string;
  number: number;
  callsign: string;
  maker: string;
}

export function shortName(name: string) {
  return name.replace(/^[^:]+:\s*/, '').trim();
}

export function livery(modelId: string, name: string, laneHint?: number): Livery {
  const h = hash(modelId);
  const idx = laneHint != null ? (h + laneHint * 3) % PALETTE.length : h % PALETTE.length;
  const [primary, accent] = PALETTE[idx];
  const chassis = ((h >>> 8) % 3) as ChassisKind;
  const maker = name.includes(':') ? name.split(':')[0].trim() : modelId.split(':')[0];
  return {
    primary,
    accent,
    chassis,
    chassisName: CHASSIS[chassis],
    number: ((h >>> 12) % 98) + 1,
    callsign: shortName(name).toUpperCase().slice(0, 22),
    maker,
  };
}

/** Assigns distinct palettes to a lineup so no two cars on the grid share colors. */
export function lineupLiveries(cars: { modelId: string; name: string }[]): Livery[] {
  const used = new Set<number>();
  return cars.map((c) => {
    const base = livery(c.modelId, c.name);
    let idx = PALETTE.findIndex(([p]) => p === base.primary);
    while (used.has(idx)) idx = (idx + 1) % PALETTE.length;
    used.add(idx);
    return { ...base, primary: PALETTE[idx][0], accent: PALETTE[idx][1] };
  });
}

export const fmtMs = (ms?: number | null) => (ms == null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`);
export const providerLabel = (p: string) => ({ openrouter: 'OpenRouter', anthropic: 'Anthropic', openai: 'OpenAI' })[p] ?? p;
