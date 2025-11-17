import type { Intersection } from '@/types';
import { svgToGps } from '@/lib/coordinateMapper';

// Base intersections defined in SVG coordinate space. lat/lng are computed at runtime
export const INTERSECTIONS_SVG: Intersection[] = [
  { id: 'int-01', name: 'George Street × King Street (CBD center)', x: 3517.56, y: 8154.85 },
  { id: 'int-02', name: 'George Street × Market Street (major crossing)', x: 3517.56, y: 9193.61 },
  { id: 'int-03', name: 'Pitt Street × King Street', x: 4090.09, y: 8249.76 },
  { id: 'int-04', name: 'Pitt Street × Market Street', x: 4055.68, y: 9189.76 },
  { id: 'int-05', name: 'George Street × Park Street (upper CBD)', x: 3557.95, y: 10285.25 },
  { id: 'int-06', name: 'George Street × Bathurst Street', x: 3473.52, y: 10988.88 },
  { id: 'int-07', name: 'George Street × Liverpool Street', x: 3203.52, y: 12023.18 },
  { id: 'int-08', name: 'George Street × Goulburn Street', x: 3020.72, y: 12728.94 },
  { id: 'int-09', name: 'George Street × Hay Street (Haymarket area)', x: 2808.13, y: 13699.05 },
  { id: 'int-10', name: 'Pitt Street × Bathurst Street', x: 3258.55, y: 14431.91 },
];

export function getIntersectionsWithGps(): Intersection[] {
  return INTERSECTIONS_SVG.map((i) => {
    const gps = svgToGps(i.x, i.y);
    return { ...i, lat: gps.lat, lng: gps.lng };
  });
}



