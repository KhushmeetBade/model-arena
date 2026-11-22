import { useLiveries } from '../store/useLiveries';
import type { CarCustom } from './types';

/** Deterministic, original vehicle liveries derived from a model id, plus user customization. */
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

/** Colour swatches offered in the Garage paint shop (custom hex colours are allowed too). */
export const SWATCHES = ['#ff2bd6', '#22e5ff', '#b6ff3b', '#ffb627', '#8b5cff', '#ff4d4d', '#3bffb1', '#4d7cff', '#ffffff', '#ff7a1a', '#c9d3ff', '#ff5e9e'];

export const CHASSIS = ['VORTEX', 'SPECTRE', 'HALCYON'] as const;
export const CHASSIS_INFO = ['Low wedge, long nose', 'Sleek fastback, high wing', 'Muscular GT, tall canopy'] as const;
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
  /** Display name for the car: the nickname if set, otherwise the model's short name (upper-case). */
  callsign: string;
  /** The real model behind the car, e.g. "Nemotron 3.5 Lightning". */
  modelName: string;
  maker: string;
  customized: boolean;
}

export function shortName(name: string) {
  return name.replace(/^[^:]+:\s*/, '').trim();
}

/** Shortens a name at a word boundary ("ERNIE-5.5-FLASH…") instead of cutting mid-word. */
export function fitName(s: string, max: number) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  // the cut already ends on a whole word when the next character is a separator
  if (/[\s-]/.test(s[max - 1] ?? '')) return `${cut.replace(/[\s\-·:]+$/, '')}…`;
  const at = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('-'));
  return `${(at >= Math.floor(max / 2) ? cut.slice(0, at) : cut).replace(/[\s\-·:]+$/, '')}…`;
}

/** Default (uncustomized) livery for a model — the same model always gets the same car. */
function base(modelId: string) {
  const h = hash(modelId);
  const [primary, accent] = PALETTE[h % PALETTE.length];
  return { primary, accent, chassis: ((h >>> 8) % 3) as ChassisKind, number: ((h >>> 12) % 98) + 1 };
}

/**
 * The car for a model, identical on every page: default livery + saved customization.
 * Pass `custom` to preview unsaved Garage edits.
 */
export function livery(modelId: string, name: string, custom?: CarCustom): Livery {
  const b = base(modelId);
  const c = custom ?? useLiveries.getState().map[modelId];
  const primary = c?.color ?? b.primary;
  const accent = primary.toLowerCase() === b.accent.toLowerCase() ? PALETTE[(hash(modelId) + 3) % PALETTE.length][1] : b.accent;
  const chassis = (c?.chassis ?? b.chassis) as ChassisKind;
  const model = shortName(name);
  return {
    primary,
    accent,
    chassis,
    chassisName: CHASSIS[chassis],
    number: c?.number ?? b.number,
    callsign: (c?.nickname || model).toUpperCase(),
    modelName: model,
    maker: name.includes(':') ? name.split(':')[0].trim() : modelId.split(':')[0],
    customized: !!c && !!(c.color || c.number || c.chassis !== undefined || c.nickname),
  };
}

/** Liveries for a grid of cars. Each car looks exactly as it does in the Garage (no recolouring). */
export function lineupLiveries(cars: { modelId: string; name: string }[]): Livery[] {
  return cars.map((c) => livery(c.modelId, c.name));
}

export const fmtMs = (ms?: number | null) => (ms == null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`);
export const providerLabel = (p: string) => ({ openrouter: 'OpenRouter', anthropic: 'Anthropic', openai: 'OpenAI', demo: 'Simulated' })[p] ?? p;
