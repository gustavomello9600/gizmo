import React from 'react';

export const CanvasSvgDefs: React.FC = React.memo(() => (
  <svg width="0" height="0" className="absolute" aria-hidden="true">
    <defs>
      <filter id="gizmo-glow-3b1b" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="gizmo-chalk-stroke" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="1" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="gizmo-soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#020617" floodOpacity="0.28" />
      </filter>
      <linearGradient id="gizmo-flipchart-paper" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FFFDF8" />
        <stop offset="100%" stopColor="#F6EFDF" />
      </linearGradient>
      <radialGradient id="gizmo-ted-spotlight" cx="50%" cy="42%" r="62%">
        <stop offset="0%" stopColor="rgba(255,255,255,0.09)" />
        <stop offset="48%" stopColor="rgba(255,255,255,0.025)" />
        <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
      </radialGradient>
    </defs>
  </svg>
));
CanvasSvgDefs.displayName = 'CanvasSvgDefs';
