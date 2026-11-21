/**
 * Per-model car customization (colour, racing number, body style, nickname), stored server-side
 * so a car looks identical on every page, in replays, and on any localhost port.
 */
export interface CarCustom {
  color?: string; // #rrggbb
  number?: number; // 1–99
  chassis?: 0 | 1 | 2; // VORTEX | SPECTRE | HALCYON
  nickname?: string; // 1–18 printable characters
  updatedAt: number;
}

export type LiveryMap = Record<string, CarCustom>;

export const NICKNAME_MAX = 18;
/** `provider:org/model[:variant]`, e.g. openrouter:nvidia/nemotron-3.5-lightning:free */
const MODEL_ID = /^(?!.*\.\.)[a-z]+:[a-z0-9_.@-]+(\/[a-z0-9_.@-]+)*(:[a-z0-9_.-]+)?$/i;
const COLOR = /^#[0-9a-f]{6}$/i;

export class LiveryError extends Error {}

/** Validates a customization request. Unset/empty fields fall back to the model's default livery. */
export function parseCustom(body: unknown): { modelId: string; custom: CarCustom } {
  const b = (body ?? {}) as Record<string, unknown>;
  const modelId = typeof b.modelId === 'string' ? b.modelId.trim() : '';
  if (modelId.length > 200 || !MODEL_ID.test(modelId)) throw new LiveryError('Invalid model id');

  const custom: CarCustom = { updatedAt: Date.now() };

  if (b.color !== undefined && b.color !== null && b.color !== '') {
    if (typeof b.color !== 'string' || !COLOR.test(b.color)) throw new LiveryError('Colour must be a hex value like #ff2bd6');
    custom.color = b.color.toLowerCase();
  }
  if (b.number !== undefined && b.number !== null && b.number !== '') {
    const n = Number(b.number);
    if (!Number.isInteger(n) || n < 1 || n > 99) throw new LiveryError('Racing number must be a whole number from 1 to 99');
    custom.number = n;
  }
  if (b.chassis !== undefined && b.chassis !== null && b.chassis !== '') {
    const c = Number(b.chassis);
    if (c !== 0 && c !== 1 && c !== 2) throw new LiveryError('Body style must be VORTEX, SPECTRE or HALCYON');
    custom.chassis = c;
  }
  if (b.nickname !== undefined && b.nickname !== null) {
    if (typeof b.nickname !== 'string') throw new LiveryError('Nickname must be text');
    // collapse whitespace, strip control characters and angle brackets
    const nick = b.nickname.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
    if (nick.length > NICKNAME_MAX) throw new LiveryError(`Nickname can be at most ${NICKNAME_MAX} characters`);
    if (nick) custom.nickname = nick;
  }
  return { modelId, custom };
}
