export function Trophy({ color = '#ffb627', className = '' }: { color?: string; className?: string }) {
  return (
    <svg viewBox="0 0 120 150" className={className}>
      <defs>
        <linearGradient id="tg" x1="0" x2="1">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset="0.45" stopColor={color} />
          <stop offset="1" stopColor="#7a4a00" />
        </linearGradient>
        <filter id="tglow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <g filter="url(#tglow)">
        <path d="M30 10h60v28c0 22-13 38-30 38S30 60 30 38z" fill="url(#tg)" />
        <path d="M30 18H14c0 18 8 28 20 30M90 18h16c0 18-8 28-20 30" fill="none" stroke="url(#tg)" strokeWidth="6" />
        <rect x="54" y="74" width="12" height="26" fill="url(#tg)" />
        <path d="M38 100h44l6 16H32z" fill="url(#tg)" />
        <rect x="26" y="116" width="68" height="18" rx="3" fill="#1b1340" stroke={color} strokeWidth="2" />
        <path d="M60 22l5 10 11 1.5-8 7.5 2 11-10-5.5-10 5.5 2-11-8-7.5 11-1.5z" fill="#fff8e1" opacity=".9" />
      </g>
    </svg>
  );
}
