import { describe, expect, it } from 'vitest';
import {
  compileExpression,
  evaluateAt,
  preprocessExpression,
  sampleCurveSegments,
  samplePolyline,
} from '../utils/safeMathParser';

describe('safeMathParser', () => {
  it('samples x^2', () => {
    const path = samplePolyline('x^2', [-2, 2], [-2, 6]);
    expect(path).toContain('M');
    expect(path.length).toBeGreaterThan(20);
  });

  it('breaks 1/x at the asymptote into at least two sub-paths', () => {
    const path = samplePolyline('1/x', [-2, 2], [-2, 2]);
    expect((path.match(/M/g) ?? []).length).toBeGreaterThanOrEqual(2);
    const segments = sampleCurveSegments('1/x', [-2, 2], [-2, 2]);
    expect(segments.length).toBeGreaterThanOrEqual(2);
    for (const segment of segments) {
      for (const point of segment) {
        expect(Math.abs(point.x)).toBeGreaterThan(0.0001);
      }
    }
  });

  it('normalizes common Portuguese synonyms', () => {
    expect(preprocessExpression('sen(x) + π')).toContain('sin(x)');
    expect(preprocessExpression('sen(x) + π')).toContain('PI');
    const fn = compileExpression('sen(x)');
    expect(fn?.(Math.PI / 2)).toBeCloseTo(1, 5);
  });

  it('returns null for invalid expressions instead of throwing', () => {
    expect(compileExpression('3 + * x')).toBeNull();
    expect(evaluateAt('sqrt(', 2)).toBeNull();
  });

  it('evaluates with a single variable', () => {
    expect(evaluateAt('2*x - 1', 3)).toBe(5);
    expect(evaluateAt('x^2', -4)).toBe(16);
  });
});
