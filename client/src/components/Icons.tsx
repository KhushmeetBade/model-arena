const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const Icon = {
  home: () => (<svg viewBox="0 0 24 24" className="h-5 w-5" {...P}><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></svg>),
  garage: () => (<svg viewBox="0 0 24 24" className="h-5 w-5" {...P}><path d="M3 20V9l9-5 9 5v11" /><path d="M7 20v-7h10v7M7 16h10" /></svg>),
  race: () => (<svg viewBox="0 0 24 24" className="h-5 w-5" {...P}><path d="M4 21V4" /><path d="M4 4h14l-3 4 3 4H4" /></svg>),
  trophy: () => (<svg viewBox="0 0 24 24" className="h-5 w-5" {...P}><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6" /></svg>),
  replay: () => (<svg viewBox="0 0 24 24" className="h-5 w-5" {...P}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="m10 9 5 3-5 3z" /></svg>),
  pit: () => (<svg viewBox="0 0 24 24" className="h-5 w-5" {...P}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8 6.2 21l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z" /></svg>),
  settings: () => (<svg viewBox="0 0 24 24" className="h-5 w-5" {...P}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>),
  bolt: () => (<svg viewBox="0 0 24 24" className="h-4 w-4" {...P}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>),
};
