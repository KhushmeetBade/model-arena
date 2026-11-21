import { useEffect, useRef, useState } from 'react';
import { lineupLiveries } from '../../lib/livery';
import type { RaceView } from '../../lib/raceState';

/** Live radio: the real streamed answer text of each competitor. */
export function Telemetry({ view, className = '' }: { view: RaceView; className?: string }) {
  const [tab, setTab] = useState(0);
  const liveries = lineupLiveries(view.cars);
  const car = view.cars[tab] ?? view.cars[0];
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [car?.text]);
  if (!car) return null;
  return (
    <div className={`glass flex flex-col overflow-hidden ${className}`}>
      <div className="flex shrink-0 overflow-x-auto border-b border-white/10">
        <div className="shrink-0 px-3 py-2 font-display text-[9px] font-bold tracking-[0.25em] text-neon-cyan">TEAM RADIO</div>
        {view.cars.map((c, i) => (
          <button
            key={c.modelId}
            onClick={() => setTab(i)}
            className={`shrink-0 px-3 py-2 font-display text-[10px] font-bold tracking-wider transition ${i === tab ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white'}`}
            style={{ borderBottom: i === tab ? `2px solid ${liveries[i].primary}` : '2px solid transparent' }}
          >
            {liveries[i].callsign.slice(0, 14)}
          </button>
        ))}
      </div>
      <div ref={box} className="answer-text min-h-0 flex-1 overflow-y-auto p-3 font-mono text-[12px] leading-relaxed text-white/85">
        {car.text || (
          <span className="text-white/35">
            {car.status === 'grid' && 'Waiting for green light…'}
            {car.status === 'waiting' && 'Request sent — waiting for first token…'}
            {car.status === 'streaming' && car.phase === 'thinking' && `Model is reasoning (${Math.round(car.reasoningChars / 4)} reasoning tokens)…`}
            {car.status === 'dnf' && `DNF: ${car.error}`}
          </span>
        )}
        {car.status === 'streaming' && car.text && <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-neon-cyan align-middle" />}
      </div>
    </div>
  );
}
