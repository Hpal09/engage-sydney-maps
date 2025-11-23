// Room data helper - provides room polygon data for click detection
import type { Room } from './svgParser';

/**
 * Get room data from the hardcoded ROOM_DATA
 * This is used for rendering clickable room overlays
 */
export function getRoomData(): Room[] {
  return ROOM_DATA;
}

/**
 * Check if a point is inside a polygon (ray casting algorithm)
 */
export function isPointInPolygon(
  point: { x: number; y: number },
  polygon: { x: number; y: number }[]
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Find which room (if any) contains the clicked point
 */
export function findRoomAtPoint(
  point: { x: number; y: number },
  rooms: Room[]
): Room | null {
  for (const room of rooms) {
    if (isPointInPolygon(point, room.polygon)) {
      return room;
    }
  }
  return null;
}

// Hardcoded room data based on the SVG structure
// This is a temporary solution until we implement client-side SVG parsing
export const ROOM_DATA: Room[] = [
  {
    id: 'world_square',
    type: 'polygon',
    polygon: [
      // These coordinates should match the actual polygon points from the SVG
      // For now, using placeholder values - these need to be extracted from the SVG
      { x: 316.53, y: 1210 },
      { x: 349.05, y: 1215.7 },
      // ... more points needed
    ],
    centroid: { x: 332, y: 1212 },
  },
  {
    id: 'QVB',
    type: 'path',
    polygon: [
      // QVB polygon points
      { x: 343, y: 900 },
      // ... more points needed
    ],
    centroid: { x: 345, y: 920 },
  },
  {
    id: 'Darling_Square_Cafe',
    type: 'circle',
    polygon: [
      // Circle approximated as polygon
    ],
    centroid: { x: 170, y: 1141 },
  },
];
