import rough from 'roughjs';
import type { Drawable, Options } from 'roughjs/bin/core';

type RoughOp = 'move' | 'lineTo' | 'bcurveTo';

interface RoughSet {
  ops: Array<{ op: RoughOp; data: number[] }>;
}

interface RoughDrawable {
  sets: RoughSet[];
}

const generator = rough.generator();
const cache = new Map<string, string>();

export function drawableToPath(drawable: Drawable | RoughDrawable): string {
  let path = '';
  for (const set of drawable.sets as RoughSet[]) {
    for (const op of set.ops) {
      const data = op.data;
      switch (op.op) {
        case 'move':
          path += `M${data[0]} ${data[1]} `;
          break;
        case 'lineTo':
          path += `L${data[0]} ${data[1]} `;
          break;
        case 'bcurveTo':
          path += `C${data[0]} ${data[1]},${data[2]} ${data[3]},${data[4]} ${data[5]} `;
          break;
        default:
          break;
      }
    }
  }
  return path.trim();
}

function remember(key: string, build: () => string): string {
  const existing = cache.get(key);
  if (existing) return existing;
  if (cache.size > 320) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  const value = build();
  cache.set(key, value);
  return value;
}

export function roughRectPath(
  seed: number,
  width: number,
  height: number,
  inset = 1,
  overrides: Options = {},
): string {
  const w = Math.max(1, width - inset * 2);
  const h = Math.max(1, height - inset * 2);
  return remember(`rect:${seed}:${Math.round(w)}:${Math.round(h)}:${inset}`, () =>
    drawableToPath(
      generator.rectangle(inset, inset, w, h, {
        seed,
        roughness: 1.55,
        bowing: 1.2,
        strokeWidth: 1.4,
        ...overrides,
      }),
    ),
  );
}

export function roughLinePath(
  seed: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  overrides: Options = {},
): string {
  return remember(`line:${seed}:${Math.round(x1)}:${Math.round(y1)}:${Math.round(x2)}:${Math.round(y2)}`, () =>
    drawableToPath(
      generator.line(x1, y1, x2, y2, {
        seed,
        roughness: 1.4,
        bowing: 1.1,
        strokeWidth: 1.4,
        ...overrides,
      }),
    ),
  );
}

export function roughEllipsePath(
  seed: number,
  width: number,
  height: number,
  overrides: Options = {},
): string {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  return remember(`ellipse:${seed}:${Math.round(w)}:${Math.round(h)}`, () =>
    drawableToPath(
      generator.ellipse(w / 2, h / 2, w, h, {
        seed,
        roughness: 1.35,
        bowing: 1.1,
        strokeWidth: 1.4,
        ...overrides,
      }),
    ),
  );
}
