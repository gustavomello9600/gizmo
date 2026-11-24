import React, { useEffect, useRef } from 'react';
import type { AudioLevel } from '../../stores/useSessionStore';

export type MascotState = 'idle' | 'listening' | 'thinking' | 'drawing' | 'muted' | 'error';

interface GizmoMascotProps {
  state: MascotState;
  audioLevelRef: React.RefObject<AudioLevel>;
  size?: number;
  onClick?: () => void;
}

export const GizmoMascot: React.FC<GizmoMascotProps> = React.memo(({
  state,
  audioLevelRef,
  size = 56,
  onClick,
}) => {
  const leftEarRef = useRef<SVGPathElement>(null);
  const rightEarRef = useRef<SVGPathElement>(null);
  const bodyRef = useRef<SVGGElement>(null);

  useEffect(() => {
    let rafId = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const rms = state === 'muted' ? 0 : (audioLevelRef.current?.rms ?? 0);
      const boost = Math.min(1.45, 1 + rms * 4.2);
      const opacity = state === 'muted' ? 0.15 : Math.min(1, 0.35 + rms * 3.5);
      if (leftEarRef.current && rightEarRef.current) {
        leftEarRef.current.style.transform = `scale(${boost})`;
        leftEarRef.current.style.opacity = String(opacity);
        rightEarRef.current.style.transform = `scale(${boost})`;
        rightEarRef.current.style.opacity = String(opacity * 0.8);
      }
      if (bodyRef.current && state === 'idle') {
        const float = Math.sin((now - started) / 1200) * 2;
        bodyRef.current.style.translate = `0 ${float}px`;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [state, audioLevelRef]);

  const tilt = state === 'drawing' ? 28 : 22;

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Gizmo (${state})`}
      className="select-none transition-transform duration-200 hover:scale-105 focus:outline-none"
      style={{ width: size, height: size, opacity: state === 'muted' ? 0.65 : 1 }}
    >
      <svg viewBox="0 0 128 128" width={size} height={size} fill="none">
        <g
          ref={bodyRef}
          style={{
            transform: `rotate(${tilt}deg)`,
            transformOrigin: '64px 64px',
            transition: 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <path
            ref={leftEarRef}
            d="M 30 38 A 18 18 0 0 0 30 64"
            stroke="var(--color-primary, #58C4DD)"
            strokeWidth="4"
            strokeLinecap="round"
            style={{ transformOrigin: '38px 51px' }}
          />
          <path
            ref={rightEarRef}
            d="M 98 38 A 18 18 0 0 1 98 64"
            stroke="var(--color-primary, #58C4DD)"
            strokeWidth="4"
            strokeLinecap="round"
            style={{ transformOrigin: '90px 51px' }}
          />

          <rect x="47" y="16" width="34" height="16" rx="8" fill="#FB7185" />
          <rect x="43" y="26" width="42" height="68" rx="12" fill="#F8FAFC" stroke="#0F172A" strokeWidth="3" />
          <rect x="44.5" y="80" width="39" height="6" fill="var(--color-primary, #58C4DD)" />
          <path d="M 47 93 L 81 93 L 64 118 Z" fill="var(--color-primary, #38BDF8)" stroke="#0F172A" strokeWidth="2.5" strokeLinejoin="round" />

          <rect x="39" y="40" width="50" height="28" rx="10" fill="#0F172A" />
          {state === 'muted' ? (
            <>
              <path d="M 48 54 Q 53 58 58 54" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" />
              <path d="M 70 54 Q 75 58 80 54" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" />
            </>
          ) : (
            <>
              <circle
                cx="53"
                cy={state === 'thinking' ? 50 : 53}
                r="4.5"
                fill={state === 'error' ? '#F59E0B' : 'var(--color-primary, #58C4DD)'}
              />
              <path
                d="M 68 55 Q 74 48 80 55"
                stroke={state === 'error' ? '#F59E0B' : 'var(--color-primary, #58C4DD)'}
                strokeWidth="3.2"
                strokeLinecap="round"
              />
            </>
          )}
        </g>

        {state === 'drawing' && (
          <path
            d="M 102 88 Q 102 98 112 98 Q 102 98 102 108 Q 102 98 92 98 Q 102 98 102 88 Z"
            fill="var(--color-accent, #FACC15)"
          />
        )}
        {state === 'error' && <circle cx="106" cy="22" r="6" fill="#F59E0B" />}
      </svg>
    </button>
  );
});
GizmoMascot.displayName = 'GizmoMascot';
