import { Parser } from 'expr-eval';

const parser = new Parser({
  operators: {
    add: true,
    concatenate: false,
    conditional: false,
    divide: true,
    factorial: false,
    multiply: true,
    power: true,
    remainder: true,
    subtract: true,
    logical: false,
    comparison: false,
    in: false,
    assignment: false,
  },
});

export function preprocessExpression(raw: string): string {
  return raw
    .replace(/π/g, 'PI')
    .replace(/\bpi\b/gi, 'PI')
    .replace(/\bln\s*\(/gi, 'log(')
    .replace(/\bsen\s*\(/gi, 'sin(')
    .replace(/\btg\s*\(/gi, 'tan(')
    .replace(/\barcsen\s*\(/gi, 'asin(')
    .replace(/\barctg\s*\(/gi, 'atan(')
    .replace(/(\d)\s*([a-zA-Z(])/g, '$1*$2')
    .replace(/\)\s*\(/g, ')*(')
    .replace(/}\s*{/g, '}*{');
}

export type CompiledFunction = (x: number) => number;

export function compileExpression(expression: string): CompiledFunction | null {
  try {
    const clean = preprocessExpression(expression);
    const parsed = parser.parse(clean);
    const variables = parsed.variables();
    if (variables.length > 1 || (variables.length === 1 && variables[0] !== 'x')) {
      return null;
    }
    return (x: number) => {
      try {
        return Number(parsed.evaluate({ x }));
      } catch {
        return Number.NaN;
      }
    };
  } catch {
    return null;
  }
}

export interface CurvePoint {
  x: number;
  y: number;
}

/**
 * Amostra uma curva e quebra o sub-caminho em descontinuidades (assíntotas).
 * 1/x em [-2, 2] produz dois segmentos separados, sem linha vertical em x=0.
 */
export function sampleCurveSegments(
  expression: string,
  domain: [number, number],
  range: [number, number],
  samples = 240,
): CurvePoint[][] {
  const fn = compileExpression(expression);
  if (!fn) return [];
  const [xMin, xMax] = domain;
  const [yMin, yMax] = range;
  const jumpLimit = (yMax - yMin) * 1.8;
  const segments: CurvePoint[][] = [];
  let current: CurvePoint[] = [];
  let previousY: number | null = null;

  for (let i = 0; i <= samples; i++) {
    const x = xMin + (i / samples) * (xMax - xMin);
    const y = fn(x);
    const finite = Number.isFinite(y);
    const discontinuity = finite && previousY !== null && Math.abs(y - previousY) > jumpLimit;
    if (!finite || discontinuity) {
      if (current.length >= 1) segments.push(current);
      current = [];
      previousY = finite ? y : null;
      if (finite) current.push({ x, y });
      continue;
    }
    current.push({ x, y });
    previousY = y;
  }
  if (current.length >= 1) segments.push(current);
  return segments;
}

export interface PointMapper {
  (x: number, y: number): { x: number; y: number };
}

export function segmentsToSvgPath(segments: CurvePoint[][], map: PointMapper): string {
  return segments
    .map((segment) =>
      segment
        .map((point, index) => {
          const mapped = map(point.x, point.y);
          return `${index === 0 ? 'M' : 'L'} ${mapped.x.toFixed(2)} ${mapped.y.toFixed(2)}`;
        })
        .join(' '),
    )
    .join(' ');
}

/** Caminho normalizado 0..1000 × 0..600, usado nos testes e em previews. */
export function samplePolyline(
  expression: string,
  domain: [number, number],
  range: [number, number],
  samples = 240,
): string {
  const segments = sampleCurveSegments(expression, domain, range, samples);
  return segmentsToSvgPath(segments, (x, y) => ({
    x: ((x - domain[0]) / (domain[1] - domain[0])) * 1000,
    y: 600 - ((y - range[0]) / (range[1] - range[0])) * 600,
  }));
}

export function evaluateAt(expression: string, x: number): number | null {
  const fn = compileExpression(expression);
  if (!fn) return null;
  const y = fn(x);
  return Number.isFinite(y) ? y : null;
}
