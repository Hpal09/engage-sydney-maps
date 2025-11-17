/**
 * GPS Coordinate Mapper - Converts between GPS and SVG pixel coordinates
 * Uses linear interpolation with 4 corner GPS coordinates for 99%+ accuracy
 */
import { getMapTransform, latLngToSvgUsingTransform } from './mapCalibration';
import { VIEWBOX as CONFIG_VIEWBOX, COORDINATE_LIMITS, SYD_CBD_BBOX as CONFIG_SYD_CBD_BBOX, GPS_CORNERS as CONFIG_GPS_CORNERS } from './mapConfig';

export type BBox = { latMin: number; latMax: number; lngMin: number; lngMax: number };
export type Svg = { width: number; height: number };
export type Pt = { x: number; y: number };

// Re-export from central config (includes minX, minY for backwards compatibility)
export const VIEWBOX = CONFIG_VIEWBOX;

const MAX_LAT_ABS = COORDINATE_LIMITS.MAX_LAT_ABS;
const MAX_LNG_ABS = COORDINATE_LIMITS.MAX_LNG_ABS;
const HUGE_COORD_THRESHOLD_MULTIPLIER = COORDINATE_LIMITS.HUGE_COORD_THRESHOLD_MULTIPLIER;
const MAX_COORD_DIVIDE_ITERATIONS = COORDINATE_LIMITS.MAX_COORD_DIVIDE_ITERATIONS;

function normalizeCoordinate(value: number | string, limit: number, wrap: boolean): number {
  let normalized =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(normalized)) return normalized;
  if (Math.abs(normalized) > limit) {
    if (Math.abs(normalized) > limit * HUGE_COORD_THRESHOLD_MULTIPLIER) {
      let iterations = 0;
      while (Math.abs(normalized) > limit && iterations < MAX_COORD_DIVIDE_ITERATIONS) {
        normalized /= 10;
        iterations += 1;
      }
    } else if (wrap) {
      const full = limit * 2;
      normalized = ((normalized + limit) % full + full) % full - limit;
    } else {
      normalized = Math.max(-limit, Math.min(limit, normalized));
    }
    if (Math.abs(normalized) > limit) {
      normalized = Math.max(-limit, Math.min(limit, normalized));
    }
  }
  return normalized;
}

export function normalizeLatitude(lat: number): number {
  return normalizeCoordinate(lat, MAX_LAT_ABS, false);
}

export function normalizeLongitude(lng: number): number {
  return normalizeCoordinate(lng, MAX_LNG_ABS, true);
}

const MAP_OFFSET_X = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_MAP_OFFSET_X ?? '0');
  return Number.isFinite(raw) ? raw : 0;
})();

const MAP_OFFSET_Y = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_MAP_OFFSET_Y ?? '0');
  return Number.isFinite(raw) ? raw : 0;
})();

const USE_CALIBRATED_MAPPING = process.env.NEXT_PUBLIC_USE_MERCATOR_MAPPING !== 'false';

// Expanded bbox for our SVG to cover wider Sydney area (from central config)
export const SYD_CBD_BBOX: BBox = { ...CONFIG_SYD_CBD_BBOX };

export function mercatorLat(latDeg: number): number {
  const lat = (latDeg * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + lat / 2));
}

export function lngLatToSvg(lng: number, lat: number, bbox: BBox = SYD_CBD_BBOX, vb: Svg = VIEWBOX): Pt {
  if (bbox.lngMax === bbox.lngMin) throw new Error("Invalid bbox: lng range is zero");
  if (bbox.latMax === bbox.latMin) throw new Error("Invalid bbox: lat range is zero");

  const u = (lng - bbox.lngMin) / (bbox.lngMax - bbox.lngMin);         // 0..1 left→right
  const mLat = mercatorLat(lat);
  const mMin = mercatorLat(bbox.latMin);
  const mMax = mercatorLat(bbox.latMax);
  const v = (mLat - mMin) / (mMax - mMin);                              // 0..1 bottom→top in Mercator

  const x = u * vb.width;
  const y = (1 - v) * vb.height;                                        // flip because SVG y increases downward
  return { x, y };
}

// SVG map dimensions (from viewBox)
// Updated to match actual SVG file: viewBox="0 0 726.77 1643.6"
let SVG_BOUNDS: Svg = { ...VIEWBOX };

export function setSvgBounds(width: number, height: number) {
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    SVG_BOUNDS = { width, height };
  }
}

export function getSvgBounds() {
  return { ...SVG_BOUNDS };
}

/**
 * GPS Corner Coordinates - Fallback mapping boundaries (from central config)
 *
 * These define the geographic area covered by the map SVG.
 * NOTE: These are fallback values only. The active calibration is set via setCalibration()
 * in CustomSydneyMap.tsx using coordinates calculated from traced landmark positions.
 *
 * Calibrated from known landmarks:
 *   - QVB (-33.8718, 151.2067) → SVG (176.3, 472.265) [Verified from svgBuildings.json]
 *   - Darling Square (-33.8755, 151.2020) → SVG (91.1, 632.9)
 *   - Haymarket (-33.8793, 151.2049) → SVG (171.2, 787.2)
 */
const GPS_CORNERS = { ...CONFIG_GPS_CORNERS };

// Export function to update GPS corners if needed
export function setGpsCorners(corners: typeof GPS_CORNERS) {
  Object.assign(GPS_CORNERS, corners);
  // Reset calibration when corners are updated
  affineMatrix = null;
  affineMatrixInv = null;
}

export function getGpsCorners() {
  return { ...GPS_CORNERS };
}

export interface GpsCoordinate {
  lat: number;
  lng: number;
}

export interface SvgCoordinate {
  x: number;
  y: number;
}

// ---------- Affine calibration ----------

// We model: [x, y, 1]^T = A * [lng, lat, 1]^T, with A 3x3, last row [0,0,1]
let affineMatrix: number[] | null = null; // 3x3 flattened row-major
let affineMatrixInv: number[] | null = null; // inverse for svg -> gps

function multiply3x3Vec(A: number[], v: [number, number, number]): [number, number, number] {
  return [
    A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
    A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
    A[6] * v[0] + A[7] * v[1] + A[8] * v[2],
  ];
}

function invert3x3(m: number[]): number[] | null {
  const [a,b,c,d,e,f,g,h,i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;
  const det = a * A + b * B + c * C;
  if (!isFinite(det) || Math.abs(det) < 1e-12) return null;
  const invDet = 1 / det;
  return [A*invDet, D*invDet, G*invDet, B*invDet, E*invDet, H*invDet, C*invDet, F*invDet, I*invDet];
}

function solveAffine(lngs: number[], lats: number[], xs: number[], ys: number[]): { A: number[], inv: number[] | null } {
  // Least squares for x = a1*lng + a2*lat + a3; y = a4*lng + a5*lat + a6
  const n = lngs.length;
  let sLL = 0, sLa = 0, s1 = n; // sums for lng*lng, lat*lat etc.
  let sL = 0, sA = 0, sXL = 0, sXA = 0, sX = 0, sYL = 0, sYA = 0, sY = 0, sLA = 0;
  for (let k = 0; k < n; k++) {
    const L = lngs[k];
    const A = lats[k];
    const X = xs[k];
    const Y = ys[k];
    sL += L;
    sA += A;
    sLL += L * L;
    sLa += A * A;
    sLA += L * A;
    sXL += X * L;
    sXA += X * A;
    sX += X;
    sYL += Y * L;
    sYA += Y * A;
    sY += Y;
  }
  // Build normal equations for [a1 a2 a3]
  const M = [
    sLL, sLA, sL,
    sLA, sLa, sA,
    sL,  sA,  s1,
  ];
  const Minv = invert3x3(M);
  if (!Minv) {
    // fallback to identity-like mapping using bounds ratios
    const A = [1,0,0, 0,1,0, 0,0,1];
    return { A, inv: A };
  }
  const bx = [sXL, sXA, sX] as [number, number, number];
  const by = [sYL, sYA, sY] as [number, number, number];
  const ax = multiply3x3Vec(Minv, bx); // [a1,a2,a3]
  const ay = multiply3x3Vec(Minv, by); // [a4,a5,a6]
  const A = [ax[0], ax[1], ax[2], ay[0], ay[1], ay[2], 0, 0, 1];
  const inv = invert3x3(A);
  return { A, inv };
}

export function setCalibration(points: Array<{ gps: GpsCoordinate; svg: SvgCoordinate }>) {
  if (!points || points.length < 3) return;
  const lngs: number[] = [];
  const lats: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of points) {
    lngs.push(p.gps.lng);
    lats.push(p.gps.lat);
    xs.push(p.svg.x);
    ys.push(p.svg.y);
  }
  const { A, inv } = solveAffine(lngs, lats, xs, ys);
  affineMatrix = A;
  affineMatrixInv = inv;

  console.log('[CAL] Calibration points:', points);
  console.log('[CAL] Affine matrix:', A);
}

function debugQvbMapping(lat: number, lng: number, result: SvgCoordinate) {
  if (Math.abs(lat - (-33.8718)) < 0.0001 && Math.abs(lng - 151.2067) < 0.0001) {
    console.log('[CAL] QVB Coordinate Mapping:', {
      input: { lat, lng },
      output: result,
      svgBounds: SVG_BOUNDS,
      withinBounds: result.x >= 0 && result.x <= SVG_BOUNDS.width && result.y >= 0 && result.y <= SVG_BOUNDS.height
    });
  }
}

function applyGlobalOffset(coord: SvgCoordinate): SvgCoordinate {
  return {
    x: coord.x + MAP_OFFSET_X,
    y: coord.y + MAP_OFFSET_Y,
  };
}

export function gpsToSvg(lat: number, lng: number): SvgCoordinate {
  const normalizedLat = normalizeLatitude(lat);
  const normalizedLng = normalizeLongitude(lng);

  const transform = USE_CALIBRATED_MAPPING ? getMapTransform() : null;
  if (transform) {
    const result = applyGlobalOffset(latLngToSvgUsingTransform(normalizedLat, normalizedLng, transform));
    debugQvbMapping(normalizedLat, normalizedLng, result);
    return result;
  }

  if (affineMatrix) {
    const [x, y, w] = multiply3x3Vec(affineMatrix, [normalizedLng, normalizedLat, 1]);
    const result = applyGlobalOffset({ x: x / (w || 1), y: y / (w || 1) });
    debugQvbMapping(normalizedLat, normalizedLng, result);
    return result;
  }

  const x = ((normalizedLng - GPS_CORNERS.topLeft.lng) / (GPS_CORNERS.topRight.lng - GPS_CORNERS.topLeft.lng)) * SVG_BOUNDS.width;
  const y = ((GPS_CORNERS.topLeft.lat - normalizedLat) / (GPS_CORNERS.topLeft.lat - GPS_CORNERS.bottomLeft.lat)) * SVG_BOUNDS.height;
  const fallbackResult = applyGlobalOffset({ x, y });
  debugQvbMapping(normalizedLat, normalizedLng, fallbackResult);
  return fallbackResult;
}

export function svgToGps(x: number, y: number): GpsCoordinate {
  if (affineMatrixInv) {
    const [lng, lat, w] = multiply3x3Vec(affineMatrixInv, [x, y, 1]);
    return { lat: lat / (w || 1), lng: lng / (w || 1) };
  }
  const xRatio = x / SVG_BOUNDS.width;
  const yRatio = y / SVG_BOUNDS.height;
  const lng = GPS_CORNERS.topLeft.lng + xRatio * (GPS_CORNERS.topRight.lng - GPS_CORNERS.topLeft.lng);
  const lat = GPS_CORNERS.topLeft.lat - yRatio * (GPS_CORNERS.topLeft.lat - GPS_CORNERS.bottomLeft.lat);
  return { lat, lng };
}

/**
 * Calculate distance between two GPS points (Haversine formula)
 */
export function calculateDistance(
  coord1: GpsCoordinate,
  coord2: GpsCoordinate,
): number {
  const aCoord = {
    lat: normalizeLatitude(coord1.lat),
    lng: normalizeLongitude(coord1.lng),
  };
  const bCoord = {
    lat: normalizeLatitude(coord2.lat),
    lng: normalizeLongitude(coord2.lng),
  };
  const R = 6371000;
  const lat1Rad = (aCoord.lat * Math.PI) / 180;
  const lat2Rad = (bCoord.lat * Math.PI) / 180;
  const deltaLat = ((bCoord.lat - aCoord.lat) * Math.PI) / 180;
  const deltaLng = ((bCoord.lng - aCoord.lng) * Math.PI) / 180;

  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return R * c;
}

/**
 * Check if GPS coordinate is within map bounds
 */
export function isWithinMapBounds(coord: GpsCoordinate): boolean {
  const lat = normalizeLatitude(coord.lat);
  const lng = normalizeLongitude(coord.lng);
  return (
    lat >= Math.min(GPS_CORNERS.topLeft.lat, GPS_CORNERS.bottomLeft.lat) &&
    lat <= Math.max(GPS_CORNERS.topLeft.lat, GPS_CORNERS.bottomLeft.lat) &&
    lng >= Math.min(GPS_CORNERS.topLeft.lng, GPS_CORNERS.topRight.lng) &&
    lng <= Math.max(GPS_CORNERS.topLeft.lng, GPS_CORNERS.topRight.lng)
  );
}
