import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

/** 3-2-1-GO. Calls onGo exactly once when the lights go green. */
export function Countdown({ onGo }: { onGo: () => void }) {
  const [n, setN] = useState(3);
  useEffect(() => {
    if (n === 0) {
      onGo();
      const t = setTimeout(() => setN(-1), 750);
      return () => clearTimeout(t);
    }
    if (n < 0) return;
    const t = setTimeout(() => setN((x) => x - 1), 850);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);
  if (n < 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center">
      <div className="mb-6 flex gap-3">
        {[3, 2, 1].map((i) => (
          <div
            key={i}
            className="h-6 w-6 rounded-full border-2 border-white/20 transition md:h-9 md:w-9"
            style={{
              background: n === 0 ? '#b6ff3b' : n <= i ? '#ff2040' : '#1a0f1a',
              boxShadow: n === 0 ? '0 0 30px #b6ff3b' : n <= i ? '0 0 24px #ff2040' : 'none',
            }}
          />
        ))}
      </div>
      <AnimatePresence mode="popLayout">
        <motion.div
          key={n}
          initial={{ scale: 2.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className={`font-display font-black italic ${n === 0 ? 'text-neon-lime' : 'text-white'} text-[22vw] leading-none md:text-[12rem]`}
          style={{ textShadow: n === 0 ? '0 0 50px #b6ff3b' : '0 0 40px #ff2bd6' }}
        >
          {n === 0 ? 'GO!' : n}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
