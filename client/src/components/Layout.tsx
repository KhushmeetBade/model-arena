import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useLiveries, useLiveryVersion } from '../store/useLiveries';
import { Icon } from './Icons';

const NAV = [
  { to: '/', label: 'Home', icon: Icon.home, end: true },
  { to: '/garage', label: 'Garage', icon: Icon.garage },
  { to: '/race', label: 'Race', icon: Icon.race },
  { to: '/champions', label: 'Champions', icon: Icon.trophy },
  { to: '/replays', label: 'Replays', icon: Icon.replay },
  { to: '/pit-crew', label: 'Pit Crew', icon: Icon.pit },
  { to: '/settings', label: 'Settings', icon: Icon.settings },
];

/** True when the API is the synthetic UI test harness (never the real app). */
function useTestMode() {
  const [test, setTest] = useState(false);
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((h) => setTest(h?.mode === 'test'))
      .catch(() => undefined);
  }, []);
  return test;
}

/** Loads saved car customizations once for the whole app and keeps them fresh. */
function useLiverySync() {
  const load = useLiveries((s) => s.load);
  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === 'visible' && void load(), 30_000);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);
}

export function Layout() {
  const loc = useLocation();
  const testMode = useTestMode();
  useLiverySync();
  useLiveryVersion(); // re-render the whole app when a car is customized
  const immersive = loc.pathname.startsWith('/race') || loc.pathname.startsWith('/replays/');
  return (
    <div className="flex min-h-full flex-col">
      {testMode && (
        <div role="status" className="relative z-[60] h-6 truncate bg-neon-amber px-2 py-1 text-center font-display text-[11px] font-black tracking-[0.2em] text-black">
          TEST MODE — synthetic scripted models, not real AI. Real app: http://localhost:5173
        </div>
      )}
      <header className={`z-50 ${immersive ? `absolute inset-x-0 ${testMode ? 'top-6' : 'top-0'}` : 'sticky top-0'} border-b border-white/5 bg-void/70 backdrop-blur-xl`}>
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4">
          <NavLink to="/" className="flex items-center gap-2">
            <img src="/favicon.svg" className="h-7 w-7" alt="" />
            <span className="font-display text-sm font-black tracking-[0.25em]">
              MODEL<span className="text-neon-pink text-glow-pink">ARENA</span>
            </span>
          </NavLink>
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `clip-tab flex items-center gap-2 px-4 py-1.5 font-display text-[11px] font-bold uppercase tracking-[0.18em] transition ${
                    isActive ? 'bg-gradient-to-r from-neon-pink/80 to-neon-violet/80 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <n.icon />
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className={`flex-1 ${immersive ? '' : 'pb-24 md:pb-10'}`}>
        <Outlet />
      </main>
      {/* mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-void/90 backdrop-blur-xl md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[8.5px] leading-tight font-bold uppercase tracking-wider ${isActive ? 'text-neon-cyan' : 'text-white/45'}`
              }
            >
              <n.icon />
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
