import React from 'react';
import type { ThemeId } from '../../types/scene';

interface Layer0BackgroundProps {
  theme: ThemeId;
}

export const Layer0Background: React.FC<Layer0BackgroundProps> = React.memo(({ theme }) => {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: 'var(--bg-canvas)' }}>
      <svg
        viewBox="0 0 1920 1080"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id="grid-dots" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1.4" cy="1.4" r="1.4" fill="var(--grid-color)" />
          </pattern>
          <pattern id="grid-cartesian" width="120" height="120" patternUnits="userSpaceOnUse">
            <path d="M 120 0 L 0 0 0 120" fill="none" stroke="var(--grid-color)" strokeWidth="1" />
            <path d="M 60 0 L 60 120 M 0 60 L 120 60" stroke="var(--grid-color)" strokeWidth="0.45" opacity="0.6" />
          </pattern>
          <pattern id="grid-blueprint" width="120" height="120" patternUnits="userSpaceOnUse">
            <path d="M 120 0 L 0 0 0 120" fill="none" stroke="var(--grid-color)" strokeWidth="1.1" />
            <path d="M 24 0 L 24 120 M 48 0 L 48 120 M 72 0 L 72 120 M 96 0 L 96 120 M 0 24 L 120 24 M 0 48 L 120 48 M 0 72 L 120 72 M 0 96 L 120 96" stroke="var(--grid-color)" strokeWidth="0.35" opacity="0.55" />
          </pattern>
          <pattern id="grid-flipchart-lines" width="100" height="46" patternUnits="userSpaceOnUse">
            <path d="M 0 45.5 L 100 45.5" stroke="rgba(120,113,108,0.16)" strokeWidth="1" />
          </pattern>
          <pattern id="grid-chalk" width="260" height="260" patternUnits="userSpaceOnUse">
            <filter id="chalk-paper-noise">
              <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="11" />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <rect width="260" height="260" fill="transparent" filter="url(#chalk-paper-noise)" opacity="0.055" />
          </pattern>
        </defs>

        {theme === '3b1b' && (
          <>
            <rect width="1920" height="1080" fill="url(#grid-cartesian)" />
            <circle cx="960" cy="560" r="640" fill="rgba(88,196,221,0.035)" />
          </>
        )}
        {theme === 'whiteboard' && <rect width="1920" height="1080" fill="url(#grid-dots)" />}
        {theme === 'flipchart' && (
          <>
            <rect width="1920" height="1080" fill="url(#grid-flipchart-lines)" opacity="0.7" />
            <rect x="0" y="0" width="1920" height="34" fill="#292524" opacity="0.9" />
            <rect x="0" y="34" width="1920" height="5" fill="#0D9488" opacity="0.5" />
            <circle cx="56" cy="17" r="6" fill="#FAF6EE" opacity="0.65" />
            <circle cx="80" cy="17" r="6" fill="#FAF6EE" opacity="0.4" />
          </>
        )}
        {theme === 'ted' && (
          <>
            <rect width="1920" height="1080" fill="url(#gizmo-ted-spotlight)" />
          </>
        )}
        {theme === 'blueprint' && (
          <>
            <rect width="1920" height="1080" fill="url(#grid-blueprint)" />
            <path d="M 72 72 L 1848 72 L 1848 1008 L 72 1008 Z" fill="none" stroke="rgba(56,189,248,0.18)" strokeWidth="1.2" strokeDasharray="10 8" />
            <path d="M 72 72 L 72 1008 M 1848 72 L 1848 1008" stroke="rgba(56,189,248,0.12)" strokeWidth="1" />
          </>
        )}
        {theme === 'chalkboard' && (
          <>
            <rect width="1920" height="1080" fill="url(#grid-chalk)" />
            <rect x="26" y="26" width="1868" height="1028" rx="10" fill="none" stroke="rgba(245,213,168,0.35)" strokeWidth="14" />
            <rect x="42" y="42" width="1836" height="996" rx="6" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="2" />
          </>
        )}
      </svg>
    </div>
  );
});
Layer0Background.displayName = 'Layer0Background';
