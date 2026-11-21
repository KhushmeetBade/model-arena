import type { ReactNode } from 'react';

export function PageHeader({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="font-display text-[11px] font-bold uppercase tracking-[0.35em] text-neon-cyan">{kicker}</div>
        <h1 className="font-display text-3xl font-black uppercase tracking-wide md:text-4xl">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function Badge({ children, tone = 'violet' }: { children: ReactNode; tone?: 'violet' | 'cyan' | 'pink' | 'lime' | 'amber' | 'red' | 'gray' }) {
  const tones: Record<string, string> = {
    violet: 'border-neon-violet/50 text-neon-violet bg-neon-violet/10',
    cyan: 'border-neon-cyan/50 text-neon-cyan bg-neon-cyan/10',
    pink: 'border-neon-pink/50 text-neon-pink bg-neon-pink/10',
    lime: 'border-neon-lime/50 text-neon-lime bg-neon-lime/10',
    amber: 'border-neon-amber/50 text-neon-amber bg-neon-amber/10',
    red: 'border-red-400/50 text-red-300 bg-red-500/10',
    gray: 'border-white/15 text-white/60 bg-white/5',
  };
  return <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-display text-[9px] font-bold uppercase tracking-widest ${tones[tone]}`}>{children}</span>;
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass clip-angle p-5 ${className}`}>{children}</div>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-200">{children}</div>;
}

export function Stat({ label, value, tone = 'text-white' }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">{label}</div>
      <div className={`font-display text-lg font-bold ${tone}`}>{value}</div>
    </div>
  );
}
