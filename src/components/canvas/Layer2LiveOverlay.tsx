import React, { useEffect, useRef } from 'react';
import { audioLevelRef } from '../../stores/useSessionStore';

export const Layer2LiveOverlay: React.FC = React.memo(() => {
  const auraRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let smooth = 0;
    const tick = () => {
      const { rms, speaking } = audioLevelRef.current;
      smooth = smooth * 0.86 + Math.min(1, rms * 8.5) * 0.14;
      if (auraRef.current) {
        auraRef.current.style.opacity = String(0.025 + smooth * 0.09);
        auraRef.current.style.transform = `translate3d(0,0,0) scale(${1 + smooth * 0.08})`;
      }
      if (ringRef.current) {
        ringRef.current.style.opacity = speaking ? String(0.15 + smooth * 0.35) : '0';
        ringRef.current.style.transform = `translate3d(0,0,0) scale(${1 + smooth * 0.06})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div
        ref={auraRef}
        className="absolute -bottom-28 -left-20 h-[420px] w-[420px] rounded-full blur-3xl"
        style={{
          background: 'radial-gradient(circle, var(--color-primary) 0%, transparent 68%)',
          opacity: 0.06,
          transition: 'opacity 120ms linear',
        }}
      />
      <div
        ref={ringRef}
        className="absolute bottom-8 left-1/2 h-12 w-[420px] -translate-x-1/2 rounded-full blur-2xl"
        style={{
          background: 'linear-gradient(90deg, transparent, var(--color-primary), transparent)',
          opacity: 0,
        }}
      />
    </div>
  );
});
Layer2LiveOverlay.displayName = 'Layer2LiveOverlay';
