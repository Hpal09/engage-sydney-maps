/**
 * Re-export types and constants from centralized config
 * This maintains backwards compatibility while using the central source of truth
 */
import { CONTROL_POINTS as CONFIG_CONTROL_POINTS, type ControlPoint as ConfigControlPoint } from './mapConfig';

export type ControlPoint = ConfigControlPoint;

// Use the centralized control points as the authoritative source
export const CONTROL_POINTS: ControlPoint[] = [...CONFIG_CONTROL_POINTS];

export type AffineTransform = {
  a: number; b: number; c: number;
  d: number; e: number; f: number;
};

function cloneMatrix(m: number[][]): number[][] {
  return m.map((row) => row.slice());
}

export function solve3x3(matrix: number[][], vector: number[]): number[] {
  if (matrix.length !== 3 || matrix.some((row) => row.length !== 3) || vector.length !== 3) {
    throw new Error('solve3x3 expects 3x3 matrix and 3x1 vector');
  }

  const m = cloneMatrix(matrix);
  const b = vector.slice();

  for (let col = 0; col < 3; col++) {
    // Partial pivoting
    let pivot = col;
    let max = Math.abs(m[col][col]);
    for (let row = col + 1; row < 3; row++) {
      const value = Math.abs(m[row][col]);
      if (value > max) {
        max = value;
        pivot = row;
      }
    }
    if (max === 0) {
      throw new Error('Matrix is singular and cannot be solved');
    }
    if (pivot !== col) {
      [m[col], m[pivot]] = [m[pivot], m[col]];
      [b[col], b[pivot]] = [b[pivot], b[col]];
    }

    // Normalize pivot row
    const pivotVal = m[col][col];
    for (let c = col; c < 3; c++) {
      m[col][c] /= pivotVal;
    }
    b[col] /= pivotVal;

    // Eliminate column in other rows
    for (let row = 0; row < 3; row++) {
      if (row === col) continue;
      const factor = m[row][col];
      if (factor === 0) continue;
      for (let c = col; c < 3; c++) {
        m[row][c] -= factor * m[col][c];
      }
      b[row] -= factor * b[col];
    }
  }

  return b;
}

export function computeAffineTransform(points: ControlPoint[]): AffineTransform {
  if (!points || points.length < 3) {
    throw new Error('computeAffineTransform requires at least 3 control points');
  }

  const ata = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const atx = [0, 0, 0];
  const aty = [0, 0, 0];

  for (const point of points) {
    const row = [point.lng, point.lat, 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        ata[i][j] += row[i] * row[j];
      }
    }
    for (let i = 0; i < 3; i++) {
      atx[i] += row[i] * point.svgX;
      aty[i] += row[i] * point.svgY;
    }
  }

  const [a, b, c] = solve3x3(ata, atx);
  const [d, e, f] = solve3x3(ata, aty);

  return { a, b, c, d, e, f };
}

export function latLngToSvgUsingTransform(lat: number, lng: number, t: AffineTransform): { x: number; y: number } {
  return {
    x: t.a * lng + t.b * lat + t.c,
    y: t.d * lng + t.e * lat + t.f,
  };
}

let cachedTransform: AffineTransform | null = null;

export function invalidateMapTransform(): void {
  cachedTransform = null;
}

export function getMapTransform(): AffineTransform | null {
  if (cachedTransform) return cachedTransform;
  if (CONTROL_POINTS.length < 3) return null;
  cachedTransform = computeAffineTransform(CONTROL_POINTS);
  return cachedTransform;
}

export function projectLatLngToSvg(lat: number, lng: number): { x: number; y: number } | null {
  const transform = getMapTransform();
  if (!transform) return null;
  return latLngToSvgUsingTransform(lat, lng, transform);
}

export function debugResiduals(): void {
  const transform = getMapTransform();
  if (!transform) {
    console.warn('No map transform available (need at least 3 control points).');
    return;
  }

  if (CONTROL_POINTS.length === 0) {
    console.warn('CONTROL_POINTS is empty; add at least 3 landmarks to compute residuals.');
    return;
  }

  for (const point of CONTROL_POINTS) {
    const projected = latLngToSvgUsingTransform(point.lat, point.lng, transform);
    const dx = projected.x - point.svgX;
    const dy = projected.y - point.svgY;
    const err = Math.hypot(dx, dy);
    console.log(
      `[CALIBRATION] ${point.name}: expected=(${point.svgX.toFixed(2)}, ${point.svgY.toFixed(2)}) ` +
      `got=(${projected.x.toFixed(2)}, ${projected.y.toFixed(2)}) ` +
      `err=(${dx.toFixed(2)}, ${dy.toFixed(2)}) |${err.toFixed(2)}px`
    );
  }
}
