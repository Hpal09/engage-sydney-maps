// SVG Parser for extracting paths, rooms, and doors from the map SVG
// SERVER-SIDE ONLY - uses Node.js fs module
import * as fs from 'fs';
import * as path from 'path';

// Types for parsed SVG data
export interface PathLine {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  accessible: boolean; // true if green, false if red
  streetName?: string;
}

export interface Room {
  id: string;
  polygon: { x: number; y: number }[];
  centroid: { x: number; y: number };
  type: 'polygon' | 'path' | 'circle';
}

export interface Door {
  id: string;
  roomId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  midpoint: { x: number; y: number };
}

export interface ParsedSVG {
  paths: PathLine[];
  rooms: Room[];
  doors: Door[];
}

/**
 * Parse SVG file and extract Paths, Rooms, and Doors layers
 */
export async function parseSVGMap(svgFilePath: string): Promise<ParsedSVG> {
  const svgContent = fs.readFileSync(svgFilePath, 'utf-8');

  // Use DOMParser in Node.js environment
  const { DOMParser } = await import('@xmldom/xmldom');
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');

  // Parse paths
  const paths = parsePathsLayer(doc);

  // Parse rooms
  const rooms = parseRoomsLayer(doc);

  // Parse doors
  const doors = parseDoorsLayer(doc);

  return { paths, rooms, doors };
}

/**
 * Extract paths from the Paths layer
 */
function parsePathsLayer(doc: Document): PathLine[] {
  const pathLines: PathLine[] = [];

  // Find the Paths layer
  const pathsGroup = findElementById(doc, 'Paths');
  if (!pathsGroup) {
    console.warn('Paths layer not found');
    return pathLines;
  }

  // Get all line and polyline elements
  const lines = pathsGroup.getElementsByTagName('line');
  const polylines = pathsGroup.getElementsByTagName('polyline');
  const pathElements = pathsGroup.getElementsByTagName('path');

  // Process <line> elements
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const pathLine = parseLineElement(line, doc);
    if (pathLine) pathLines.push(pathLine);
  }

  // Process <polyline> elements (split into segments)
  for (let i = 0; i < polylines.length; i++) {
    const polyline = polylines[i];
    const segments = parsePolylineElement(polyline, doc);
    pathLines.push(...segments);
  }

  // Process <path> elements (split into segments)
  for (let i = 0; i < pathElements.length; i++) {
    const pathElem = pathElements[i];
    const segments = parsePathElement(pathElem, doc);
    pathLines.push(...segments);
  }

  return pathLines;
}

/**
 * Parse a single <line> element
 */
function parseLineElement(line: Element, doc: Document): PathLine | null {
  const id = line.getAttribute('id') || '';
  const x1 = parseFloat(line.getAttribute('x1') || '0');
  const y1 = parseFloat(line.getAttribute('y1') || '0');
  const x2 = parseFloat(line.getAttribute('x2') || '0');
  const y2 = parseFloat(line.getAttribute('y2') || '0');

  const className = line.getAttribute('class') || '';
  const accessible = isAccessiblePath(className, doc);

  const streetName = line.getAttribute('data-name') || extractStreetName(id);

  return { id, x1, y1, x2, y2, accessible, streetName };
}

/**
 * Parse a <polyline> element into multiple line segments
 */
function parsePolylineElement(polyline: Element, doc: Document): PathLine[] {
  const id = polyline.getAttribute('id') || '';
  const pointsStr = polyline.getAttribute('points') || '';
  const className = polyline.getAttribute('class') || '';
  const accessible = isAccessiblePath(className, doc);
  const streetName = polyline.getAttribute('data-name') || extractStreetName(id);

  const points = parsePoints(pointsStr);
  const segments: PathLine[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    segments.push({
      id: `${id}_seg${i}`,
      x1: points[i].x,
      y1: points[i].y,
      x2: points[i + 1].x,
      y2: points[i + 1].y,
      accessible,
      streetName,
    });
  }

  return segments;
}

/**
 * Parse a <path> element into multiple line segments
 */
function parsePathElement(pathElem: Element, doc: Document): PathLine[] {
  const id = pathElem.getAttribute('id') || '';
  const d = pathElem.getAttribute('d') || '';
  const className = pathElem.getAttribute('class') || '';
  const accessible = isAccessiblePath(className, doc);
  const streetName = pathElem.getAttribute('data-name') || extractStreetName(id);

  // Simple path parser for M (moveto) and L (lineto) commands
  const points = parsePathD(d);
  const segments: PathLine[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    segments.push({
      id: `${id}_seg${i}`,
      x1: points[i].x,
      y1: points[i].y,
      x2: points[i + 1].x,
      y2: points[i + 1].y,
      accessible,
      streetName,
    });
  }

  return segments;
}

/**
 * Determine if a path is accessible based on CSS class
 */
function isAccessiblePath(className: string, doc: Document): boolean {
  // Check if class is st83 (green) or st79 (red)
  if (className.includes('st83')) return true; // green = accessible
  if (className.includes('st79')) return false; // red = non-accessible

  // Default to accessible
  return true;
}

/**
 * Extract street name from ID (e.g., "George_St6" -> "George St")
 */
function extractStreetName(id: string): string {
  // Remove trailing numbers
  const nameMatch = id.match(/^([A-Za-z_]+)/);
  if (nameMatch) {
    return nameMatch[1].replace(/_/g, ' ');
  }
  return '';
}

/**
 * Parse points string "x1 y1 x2 y2 ..." into array of {x, y}
 */
function parsePoints(pointsStr: string): { x: number; y: number }[] {
  const coords = pointsStr.trim().split(/\s+/);
  const points: { x: number; y: number }[] = [];

  for (let i = 0; i < coords.length; i += 2) {
    points.push({
      x: parseFloat(coords[i]),
      y: parseFloat(coords[i + 1]),
    });
  }

  return points;
}

/**
 * Parse SVG path d attribute (simplified for M and L commands)
 */
function parsePathD(d: string): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];

  // Match M (moveto) and L (lineto) commands with coordinates
  const regex = /([ML])\s*([0-9.-]+)[,\s]+([0-9.-]+)/g;
  let match;

  while ((match = regex.exec(d)) !== null) {
    points.push({
      x: parseFloat(match[2]),
      y: parseFloat(match[3]),
    });
  }

  return points;
}

/**
 * Extract rooms from the City_Centre layer
 */
function parseRoomsLayer(doc: Document): Room[] {
  const rooms: Room[] = [];

  // Find Base → City_Centre layer
  const cityCentreGroup = findElementById(doc, 'City_Centre');
  if (!cityCentreGroup) {
    console.warn('City_Centre layer not found');
    return rooms;
  }

  // Look for room elements (polygon, path, circle)
  const polygons = cityCentreGroup.getElementsByTagName('polygon');
  const paths = cityCentreGroup.getElementsByTagName('path');
  const circles = cityCentreGroup.getElementsByTagName('circle');

  // Parse polygons
  for (let i = 0; i < polygons.length; i++) {
    const polygon = polygons[i];
    const id = polygon.getAttribute('id') || '';
    if (!id) continue;

    const pointsStr = polygon.getAttribute('points') || '';
    const polygon_points = parsePoints(pointsStr);
    const centroid = calculateCentroid(polygon_points);

    rooms.push({ id, polygon: polygon_points, centroid, type: 'polygon' });
  }

  // Parse paths (used for QVB)
  for (let i = 0; i < paths.length; i++) {
    const pathElem = paths[i];
    const id = pathElem.getAttribute('id') || '';
    if (!id) continue;

    const d = pathElem.getAttribute('d') || '';
    const polygon_points = parsePathD(d);
    const centroid = calculateCentroid(polygon_points);

    rooms.push({ id, polygon: polygon_points, centroid, type: 'path' });
  }

  // Parse circles
  for (let i = 0; i < circles.length; i++) {
    const circle = circles[i];
    const id = circle.getAttribute('id') || '';
    if (!id) continue;

    const cx = parseFloat(circle.getAttribute('cx') || '0');
    const cy = parseFloat(circle.getAttribute('cy') || '0');
    const r = parseFloat(circle.getAttribute('r') || '10');

    // Approximate circle as polygon
    const polygon_points = approximateCircle(cx, cy, r);
    const centroid = { x: cx, y: cy };

    rooms.push({ id, polygon: polygon_points, centroid, type: 'circle' });
  }

  return rooms;
}

/**
 * Extract doors from the doors layer
 */
function parseDoorsLayer(doc: Document): Door[] {
  const doors: Door[] = [];

  const doorsGroup = findElementById(doc, 'doors');
  if (!doorsGroup) {
    console.warn('doors layer not found');
    return doors;
  }

  const lines = doorsGroup.getElementsByTagName('line');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const id = line.getAttribute('id') || '';
    const x1 = parseFloat(line.getAttribute('x1') || '0');
    const y1 = parseFloat(line.getAttribute('y1') || '0');
    const x2 = parseFloat(line.getAttribute('x2') || '0');
    const y2 = parseFloat(line.getAttribute('y2') || '0');

    // Extract room ID from door ID (e.g., "QVB_x5F_door1" -> "QVB")
    const roomId = extractRoomIdFromDoor(id);

    const midpoint = {
      x: (x1 + x2) / 2,
      y: (y1 + y2) / 2,
    };

    doors.push({ id, roomId, x1, y1, x2, y2, midpoint });
  }

  return doors;
}

/**
 * Extract room ID from door ID
 * Examples:
 * - "QVB_x5F_door1" -> "QVB"
 * - "world_x5F_square_x5F_door1" -> "world_square"
 */
function extractRoomIdFromDoor(doorId: string): string {
  // Replace _x5F_ with _ (URL encoded underscore)
  const decoded = doorId.replace(/_x5F_/g, '_');

  // Remove _door suffix
  const match = decoded.match(/^(.+?)_door\d*$/);
  if (match) {
    return match[1];
  }

  return doorId;
}

/**
 * Calculate centroid of a polygon
 */
function calculateCentroid(points: { x: number; y: number }[]): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };

  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });

  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
}

/**
 * Approximate a circle as a polygon with 16 points
 */
function approximateCircle(cx: number, cy: number, r: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const numPoints = 16;

  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    points.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }

  return points;
}

/**
 * Find element by ID in the document
 */
function findElementById(doc: Document, id: string): Element | null {
  const elements = doc.getElementsByTagName('*');
  for (let i = 0; i < elements.length; i++) {
    if (elements[i].getAttribute('id') === id) {
      return elements[i];
    }
  }
  return null;
}

// NOTE: This file contains server-side only code (uses Node.js fs module)
// For client-side graph loading, use graphLoader.ts instead

