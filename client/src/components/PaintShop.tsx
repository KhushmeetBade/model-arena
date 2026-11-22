import { useState } from 'react';
import { CHASSIS, CHASSIS_INFO, livery, SWATCHES } from '../lib/livery';
import type { CarCustom, ModelInfo } from '../lib/types';
import { useLiveries } from '../store/useLiveries';

const NICK_MAX = 18;

const same = (a: CarCustom, b: CarCustom) =>
  (a.color ?? '') === (b.color ?? '') && (a.number ?? '') === (b.number ?? '') && (a.chassis ?? '') === (b.chassis ?? '') && (a.nickname ?? '') === (b.nickname ?? '');

/**
 * Garage paint shop: colour, racing number, body style and nickname for one model's car.
 * Edits preview live (via `onDraft`) and are saved server-side so the car looks the same everywhere.
 */
export function PaintShop({ model, draft, onDraft }: { model: ModelInfo; draft: CarCustom; onDraft: (d: CarCustom) => void }) {
  const saved = useLiveries((s) => s.map[model.id]) ?? {};
  const save = useLiveries((s) => s.save);
  const reset = useLiveries((s) => s.reset);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const factory = livery(model.id, model.name, {});
  const current = livery(model.id, model.name, draft);
  const dirty = !same(draft, saved);
  const numberValid = draft.number === undefined || (Number.isInteger(draft.number) && draft.number >= 1 && draft.number <= 99);

  async function onSave() {
    setBusy(true);
    setMsg(null);
    try {
      await save(model.id, { color: draft.color, number: draft.number, chassis: draft.chassis, nickname: draft.nickname?.trim() || undefined });
      setMsg({ ok: true, text: 'Saved — this car now looks like this on every page and in replays.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    setBusy(true);
    setMsg(null);
    try {
      await reset(model.id);
      onDraft({});
      setMsg({ ok: true, text: 'Restored the factory livery.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const label = 'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.2em] text-white/45';

  return (
    <section aria-label="Customize car" className="space-y-4 border-t border-white/5 pt-4">
      <div className="flex items-center justify-between">
        <div className="font-display text-sm font-bold tracking-[0.2em] text-neon-cyan">PAINT SHOP</div>
        {current.customized && <span className="text-[11px] text-white/40">customized</span>}
      </div>

      <div>
        <label className={label} htmlFor="nick">
          Nickname <span className="normal-case tracking-normal text-white/30">({(draft.nickname ?? '').length}/{NICK_MAX})</span>
        </label>
        <input
          id="nick"
          value={draft.nickname ?? ''}
          maxLength={NICK_MAX}
          placeholder={factory.callsign}
          onChange={(e) => onDraft({ ...draft, nickname: e.target.value || undefined })}
          className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 font-display text-sm uppercase tracking-wider outline-none placeholder:text-white/25 focus:border-neon-cyan"
        />
        <p className="mt-1 text-[11px] text-white/40">Shown on the car, HUD and results. The real model ({factory.modelName}) is always listed alongside.</p>
      </div>

      <div>
        <span className={label}>Colour</span>
        <div className="flex flex-wrap items-center gap-2">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={current.primary === c}
              onClick={() => onDraft({ ...draft, color: c })}
              className={`h-10 w-10 rounded-full border-2 transition ${current.primary === c ? 'scale-110 border-white' : 'border-transparent hover:scale-105'}`}
              style={{ background: c, boxShadow: current.primary === c ? `0 0 14px ${c}` : undefined }}
            />
          ))}
          <label className="relative flex h-11 cursor-pointer items-center gap-1 rounded-full border border-white/20 px-2 text-[10px] font-bold uppercase tracking-widest text-white/60 hover:border-white/50">
            Custom
            <input type="color" value={current.primary} onChange={(e) => onDraft({ ...draft, color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Custom colour" />
          </label>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[110px_1fr]">
        <div>
          <label className={label} htmlFor="num">
            Number
          </label>
          <input
            id="num"
            type="number"
            min={1}
            max={99}
            value={draft.number ?? ''}
            placeholder={String(factory.number)}
            onChange={(e) => onDraft({ ...draft, number: e.target.value === '' ? undefined : Math.trunc(Number(e.target.value)) })}
            className={`w-full rounded border bg-black/40 px-3 py-2 font-display text-lg font-black italic outline-none placeholder:text-white/25 ${numberValid ? 'border-white/15 focus:border-neon-cyan' : 'border-red-500'}`}
          />
          {!numberValid && <p className="mt-1 text-[11px] text-red-300">1–99 only</p>}
        </div>
        <div>
          <span className={label}>Body style</span>
          <div className="grid grid-cols-3 gap-2">
            {CHASSIS.map((name, i) => (
              <button
                key={name}
                type="button"
                aria-pressed={current.chassis === i}
                onClick={() => onDraft({ ...draft, chassis: i as 0 | 1 | 2 })}
                title={CHASSIS_INFO[i]}
                className={`clip-tab min-h-10 px-2 py-2 text-center font-display text-[10px] font-bold tracking-widest transition ${current.chassis === i ? 'bg-neon-violet/70 text-white' : 'bg-white/5 text-white/55 hover:bg-white/10'}`}
              >
                {name}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-white/40">{CHASSIS_INFO[current.chassis]}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={busy || !dirty || !numberValid}
          className="btn-race clip-angle min-h-11 px-5 py-2.5 text-xs font-black disabled:opacity-40"
        >
          {busy ? 'SAVING…' : dirty ? 'SAVE CAR' : 'SAVED'}
        </button>
        {dirty && (
          <button type="button" onClick={() => onDraft({ ...saved })} className="px-3 py-2 text-xs text-white/60 hover:text-white">
            Discard changes
          </button>
        )}
        {(current.customized || Object.keys(saved).length > 0) && (
          <button type="button" onClick={onReset} disabled={busy} className="ml-auto px-3 py-2 text-xs text-white/50 hover:text-red-300">
            Reset to factory
          </button>
        )}
      </div>
      {msg && <p className={`text-xs ${msg.ok ? 'text-neon-lime' : 'text-red-300'}`}>{msg.text}</p>}
    </section>
  );
}
