import React from 'react';
import type { RendererProps } from '../../../types/scene';

const NOTE_COLORS: Record<string, { bg: string; border: string }> = {
  yellow: { bg: '#FEF3C7', border: '#F59E0B' },
  pink: { bg: '#FCE7F3', border: '#DB2777' },
  mint: { bg: '#D1FAE5', border: '#059669' },
  blue: { bg: '#DBEAFE', border: '#2563EB' },
};

export const FreehandNoteRenderer: React.FC<RendererProps> = React.memo(({ node }) => {
  const data = node.data as {
    text?: string;
    color?: 'yellow' | 'pink' | 'mint' | 'blue';
    rotation_deg?: number;
  };
  const colors = NOTE_COLORS[data.color ?? 'yellow'] ?? NOTE_COLORS.yellow;
  const rotation = Math.max(-4, Math.min(4, data.rotation_deg ?? -2));

  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <div
        className="relative flex h-full w-full items-center justify-center px-5 py-6"
        style={{
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          boxShadow: '0 14px 24px -18px rgba(15, 23, 42, 0.65)',
          transform: `rotate(${rotation}deg)`,
          borderRadius: 4,
        }}
      >
        <span
          className="absolute -top-2 left-1/2 h-5 w-16 -translate-x-1/2 rounded-sm"
          style={{ background: 'rgba(255,255,255,0.58)', boxShadow: '0 1px 2px rgba(15,23,42,0.12)' }}
        />
        <p
          className="text-center text-[23px] leading-snug"
          style={{ color: '#292524', fontFamily: "'Kalam', 'Caveat', var(--font-heading)", fontWeight: 700 }}
        >
          {data.text ?? ''}
        </p>
      </div>
    </div>
  );
});
FreehandNoteRenderer.displayName = 'FreehandNoteRenderer';
