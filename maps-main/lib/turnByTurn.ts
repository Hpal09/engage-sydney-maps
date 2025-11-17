import type { PathNode } from '@/types';
import { svgToGps, calculateDistance } from '@/lib/coordinateMapper';

export interface GpsPoint { lat: number; lng: number }

export function nodesToGps(route: PathNode[]): GpsPoint[] {
  return route.map((n) => {
    const lat = typeof n.lat === 'number' ? n.lat : undefined;
    const lng = typeof n.lng === 'number' ? n.lng : undefined;
    if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
    const gps = svgToGps(n.x, n.y);
    return { lat: gps.lat, lng: gps.lng };
  });
}

function bearingDegrees(a: GpsPoint, b: GpsPoint): number {
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  let brng = Math.atan2(y, x) * 180 / Math.PI; // -180..+180
  brng = (brng + 360) % 360; // 0..360
  return brng;
}

function cardinalFromBearing(deg: number): string {
  const dirs = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  const idx = Math.round(deg / 45) % 8;
  return dirs[idx];
}

function turnDirection(a: GpsPoint, b: GpsPoint, c: GpsPoint): 'left' | 'right' | 'straight' {
  // Use planar cross product for orientation
  const v1x = b.lng - a.lng; const v1y = b.lat - a.lat;
  const v2x = c.lng - b.lng; const v2y = c.lat - b.lat;
  const cross = v1x * v2y - v1y * v2x;
  // Angle between segments
  const dot = v1x * v2x + v1y * v2y;
  const mag1 = Math.hypot(v1x, v1y); const mag2 = Math.hypot(v2x, v2y);
  if (mag1 === 0 || mag2 === 0) return 'straight';
  const cos = Math.min(1, Math.max(-1, dot / (mag1 * mag2)));
  const angle = Math.acos(cos) * 180 / Math.PI; // 0..180
  if (angle < 25) return 'straight';
  return cross > 0 ? 'left' : 'right';
}

/**
 * Format distance in meters to human-readable string
 * Examples: "50m", "850m", "1.2km", "5.0km"
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }

  // For kilometers, show 1 decimal place
  const km = meters / 1000;
  return `${km.toFixed(1)}km`;
}

/**
 * Calculate estimated time of arrival based on walking speed
 * Average walking speed: 1.4 m/s (5 km/h)
 * Returns formatted string: "Just now", "5 min", "12 min", "1h 5m", "2h 30m"
 */
export function calculateETA(distanceMeters: number): string {
  const WALKING_SPEED = 1.4; // meters per second (5 km/h)
  const timeSeconds = distanceMeters / WALKING_SPEED;
  const timeMinutes = Math.round(timeSeconds / 60);

  // Less than 1 minute
  if (timeMinutes < 1) {
    return 'Just now';
  }

  // Less than 1 hour: show minutes only
  if (timeMinutes < 60) {
    return `${timeMinutes} min`;
  }

  // 1+ hours: show hours and minutes
  const hours = Math.floor(timeMinutes / 60);
  const minutes = timeMinutes % 60;

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

export function getNextInstruction(route: PathNode[], user?: GpsPoint): { text: string; reachedDestination: boolean } {
  if (!route || route.length < 2) return { text: '', reachedDestination: false };
  if (!user) {
    const gps = nodesToGps(route);
    const dir = cardinalFromBearing(bearingDegrees(gps[0], gps[1]));
    return { text: `Head ${dir}`, reachedDestination: false };
  }

  const gps = nodesToGps(route);

  // Find closest point index along route
  let bestIdx = 0; let bestD = Infinity;
  for (let i = 0; i < gps.length; i++) {
    const d = calculateDistance(user, gps[i]);
    if (d < bestD) { bestD = d; bestIdx = i; }
  }

  // Destination check
  const distToEnd = calculateDistance(user, gps[gps.length - 1]);
  if (distToEnd < 20) return { text: 'You have arrived', reachedDestination: true };

  const idx = Math.min(bestIdx, gps.length - 2);
  const next = gps[idx + 1];
  const distToNext = calculateDistance(user, next);

  if (idx + 2 < gps.length) {
    const turn = turnDirection(gps[idx], gps[idx + 1], gps[idx + 2]);
    if (distToNext < 18) {
      if (turn === 'straight') return { text: 'Continue straight', reachedDestination: false };
      return { text: `Turn ${turn} ahead`, reachedDestination: false };
    }
  }

  const dir = cardinalFromBearing(bearingDegrees(gps[idx], next));
  const meters = Math.max(5, Math.round(distToNext));
  return { text: `Head ${dir} for ${meters} m`, reachedDestination: false };
}



