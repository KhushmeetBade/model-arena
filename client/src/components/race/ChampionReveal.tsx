import { motion } from 'framer-motion';
import { useState } from 'react';
import { fmtMs, lineupLiveries, providerLabel } from '../../lib/livery';
import type { RaceView } from '../../lib/raceState';
import { Trophy } from './Trophy';

export function ChampionReveal({ view, onClose, actions }: { view: RaceView; onClose: () => void; actions?: React.ReactNode }) {
  const [showAnswers, setShowAnswers] = useState(false);
  const liveries = lineupLiveries(view.cars);
  const standings = [...(view.standings ?? [])].sort((a, b) => a.rank - b.rank);
  const champ = view.cars.find((c) => c.modelId === view.championId);
  const champLv = champ ? liveries[view.cars.indexOf(champ)] : null;
  const podium = [standings[1], standings[0], standings[2]];
  const heights = ['h-24', 'h-36', 'h-16'];
  const car = (modelId: string) => view.cars.find((c) => c.modelId === modelId)!;
  const lv = (modelId: string) => liveries[view.cars.findIndex((c) => c.modelId === modelId)];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-40 overflow-y-auto bg-void/75 backdrop-blur-md">
      <div className="mx-auto max-w-5xl px-4 pb-28 pt-20 md:pt-24">
        {champ && champLv ? (
          <div className="text-center">
            <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="font-display text-xs font-bold tracking-[0.5em] text-neon-amber">
              CHAMPION
            </motion.div>
            <motion.div initial={{ scale: 0.2, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', delay: 0.4, stiffness: 120 }} className="mx-auto my-2 w-28 md:w-36">
              <Trophy color="#ffb627" />
            </motion.div>
            <motion.h2
              initial={{ letterSpacing: '0.6em', opacity: 0 }}
              animate={{ letterSpacing: '0.06em', opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.8 }}
              className="font-display text-3xl font-black italic md:text-5xl"
              style={{ color: champLv.primary, textShadow: `0 0 40px ${champLv.primary}` }}
            >
              {champLv.callsign}
            </motion.h2>
            <div className="mt-1 text-white/60">
              {providerLabel(champ.provider)} · #{champLv.number} {champLv.chassisName}
            </div>
          </div>
        ) : (
          <div className="text-center">
            <h2 className="font-display text-3xl font-black text-red-300">NO CHAMPION</h2>
            <p className="text-white/60">{view.evaluation?.note ?? 'No competitor finished the race.'}</p>
          </div>
        )}

        {standings.length > 0 && (
          <div className="mx-auto mt-8 grid max-w-xl grid-cols-3 items-end gap-2">
            {podium.map((s, i) =>
              s && s.status !== 'dnf' ? (
                <motion.div key={s.modelId} initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1 + i * 0.15 }} className="text-center">
                  <div className="truncate font-display text-[11px] font-bold" style={{ color: lv(s.modelId).primary }}>{lv(s.modelId).callsign}</div>
                  <div className="font-mono text-xs text-white/60">{s.scores?.total.toFixed(1) ?? '—'} pts</div>
                  <div
                    className={`${heights[i]} clip-angle mt-1 flex items-start justify-center pt-2 font-display text-3xl font-black italic`}
                    style={{ background: `linear-gradient(180deg, ${lv(s.modelId).primary}cc, ${lv(s.modelId).primary}22)`, boxShadow: `0 0 30px ${lv(s.modelId).primary}55` }}
                  >
                    {s.rank}
                  </div>
                </motion.div>
              ) : (
                <div key={i} />
              ),
            )}
          </div>
        )}

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }} className="glass clip-angle mt-8 p-4 md:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="font-display text-sm font-bold tracking-[0.2em]">RACE CLASSIFICATION</div>
            <div className="text-xs text-white/50">
              {view.evaluation?.method === 'llm-judge' ? <>Judged by <b className="text-white/80">{view.evaluation.judgeName}</b></> : 'No judge verdict'}
            </div>
          </div>
          {view.evaluation?.summary && <p className="mb-3 text-sm text-white/75">“{view.evaluation.summary}”</p>}
          {view.evaluation?.note && <p className="mb-3 rounded border border-neon-amber/30 bg-neon-amber/10 px-3 py-2 text-xs text-neon-amber">{view.evaluation.note}</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="font-display text-[10px] tracking-widest text-white/40">
                <tr>
                  <th className="py-2">POS</th><th>COMPETITOR</th><th>QUALITY</th><th>SPEED</th><th>LATENCY</th><th>TTFT</th><th>TOKENS</th><th className="text-right">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s) => {
                  const c = car(s.modelId);
                  return (
                    <tr key={s.modelId} className="border-t border-white/5 align-top">
                      <td className="py-2 font-display font-black italic">{s.status === 'dnf' ? 'DNF' : s.rank}</td>
                      <td className="py-2">
                        <div className="font-display text-xs font-bold" style={{ color: lv(s.modelId).primary }}>{lv(s.modelId).callsign}</div>
                        {s.judge?.comment && <div className="max-w-[260px] text-xs text-white/50">{s.judge.comment}</div>}
                        {c.error && <div className="max-w-[260px] truncate text-xs text-red-300/80" title={c.error}>{c.error}</div>}
                      </td>
                      <td className="py-2 font-mono" title={s.judge ? `accuracy ${s.judge.accuracy} · helpfulness ${s.judge.helpfulness} · clarity ${s.judge.clarity} · completeness ${s.judge.completeness}` : ''}>
                        {s.scores?.quality ?? '—'}
                      </td>
                      <td className="py-2 font-mono">{s.scores?.speed ?? '—'}</td>
                      <td className="py-2 font-mono">{fmtMs(s.latencyMs)}</td>
                      <td className="py-2 font-mono">{fmtMs(c.ttftMs)}</td>
                      <td className="py-2 font-mono">{c.outputTokens ?? '—'}{c.tokensEstimated ? '~' : ''}</td>
                      <td className="py-2 text-right font-display font-bold text-neon-cyan">{s.scores?.total.toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-white/40">Quality = judge's mean of accuracy, helpfulness, clarity, completeness (×10). Speed = fastest latency ÷ this latency. ~ = estimated token count.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => setShowAnswers((x) => !x)} className="clip-tab bg-white/10 px-4 py-2 font-display text-[11px] font-bold tracking-widest hover:bg-white/20">
              {showAnswers ? 'HIDE ANSWERS' : 'VIEW ANSWERS'}
            </button>
            {actions}
            <button onClick={onClose} className="clip-tab bg-white/5 px-4 py-2 font-display text-[11px] font-bold tracking-widest text-white/60 hover:bg-white/10">VIEW TRACK</button>
          </div>
        </motion.div>

        {showAnswers && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {standings.map((s) => {
              const c = car(s.modelId);
              return (
                <div key={s.modelId} className="glass p-4" style={{ borderTop: `3px solid ${lv(s.modelId).primary}` }}>
                  <div className="mb-2 font-display text-xs font-bold">{s.status === 'dnf' ? 'DNF' : `P${s.rank}`} · {lv(s.modelId).callsign}</div>
                  <div className="answer-text max-h-80 overflow-y-auto font-mono text-xs leading-relaxed text-white/80">{c.text || c.error || '(no output)'}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
