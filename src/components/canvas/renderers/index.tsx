import React from 'react';
import type { RendererProps } from '../../../types/scene';
import { BulletsRenderer } from './BulletsRenderer';
import { CalloutRenderer } from './CalloutRenderer';
import { ChartRenderer } from './ChartRenderer';
import { CodeRenderer } from './CodeRenderer';
import { ComparisonRenderer } from './ComparisonRenderer';
import { DiagramRenderer } from './DiagramRenderer';
import { FreehandNoteRenderer } from './FreehandNoteRenderer';
import { FunnelRenderer } from './FunnelRenderer';
import { Geometry2DRenderer } from './Geometry2DRenderer';
import { KpiRenderer } from './KpiRenderer';
import { MathRenderer } from './MathRenderer';
import { Matrix2x2Renderer } from './Matrix2x2Renderer';
import { Plot2DRenderer } from './Plot2DRenderer';
import { TimelineRenderer } from './TimelineRenderer';

export const RenderNode: React.FC<RendererProps> = ({ node, rect, theme }) => {
  switch (node.kind) {
    case 'math':
      return <MathRenderer node={node} rect={rect} theme={theme} />;
    case 'plot_2d':
      return <Plot2DRenderer node={node} rect={rect} theme={theme} />;
    case 'geometry_2d':
      return <Geometry2DRenderer node={node} rect={rect} theme={theme} />;
    case 'chart':
      return <ChartRenderer node={node} rect={rect} theme={theme} />;
    case 'diagram':
      return <DiagramRenderer node={node} rect={rect} theme={theme} />;
    case 'bullets':
      return <BulletsRenderer node={node} rect={rect} theme={theme} />;
    case 'code':
      return <CodeRenderer node={node} rect={rect} theme={theme} />;
    case 'matrix_2x2':
      return <Matrix2x2Renderer node={node} rect={rect} theme={theme} />;
    case 'funnel':
      return <FunnelRenderer node={node} rect={rect} theme={theme} />;
    case 'timeline':
      return <TimelineRenderer node={node} rect={rect} theme={theme} />;
    case 'kpi':
      return <KpiRenderer node={node} rect={rect} theme={theme} />;
    case 'comparison':
      return <ComparisonRenderer node={node} rect={rect} theme={theme} />;
    case 'callout':
      return <CalloutRenderer node={node} rect={rect} theme={theme} />;
    case 'freehand_note':
      return <FreehandNoteRenderer node={node} rect={rect} theme={theme} />;
    default:
      return <CalloutRenderer node={node} rect={rect} theme={theme} />;
  }
};
