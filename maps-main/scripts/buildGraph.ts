/**
 * Build street-level navigation graph from SVG Paths, Doors, and Rooms layers
 * Run with: npx ts-node scripts/buildGraph.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseSVGMap } from '../lib/svgParser';
import { buildGraphFromSVG } from '../lib/graphBuilder';

interface PathNode {
  id: string;
  x: number;
  y: number;
  lat?: number;
  lng?: number;
  street?: string;
}

interface PreDefinedRoute {
  fromId: string;
  toId: string;
  path: Array<{ x: number; y: number }>;
  streets: string[];
}

interface PathGraph {
  nodesById: Record<string, PathNode>;
  adjacency: Record<string, Array<{ to: string; distance: number; points?: Array<{ x: number; y: number }>; street?: string }>>;
  predefinedRoutes?: PreDefinedRoute[];
}

const SAMPLE_DISTANCE = 10; // Sample every 10 SVG units (IMPROVED: denser sampling for better path representation)
const DEDUP_THRESHOLD = 5; // Merge nodes within 5 units as duplicates (tight threshold to preserve detail)
const CONNECTION_THRESHOLD = 35; // Connect nodes within 35 units across segments (for intersections)
const MAX_STRAIGHT_EDGE_DISTANCE = 45; // Maximum straight-line distance to prevent shortcuts through buildings

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Extract street name from SVG element
// Priority: 1) data-street attribute, 2) id attribute
function extractStreetName(element: string): string | undefined {
  // Check for data-street attribute first
  let match = element.match(/data-street="([^"]+)"/i);
  if (match) return match[1];

  // Check for id attribute (convert underscores to spaces)
  match = element.match(/\sid="([^"]+)"/i);
  if (match) {
    const id = match[1];
    // Convert underscores to spaces and clean up
    return id.replace(/_/g, ' ').trim();
  }

  return undefined;
}

// Enhanced path parser using svg-path-parser library
function parsePath(d: string): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  
  try {
    // Use the svg-path-parser library for proper curve handling
    const { parseSVG } = require('svg-path-parser');
    const commands = parseSVG(d);
    
    for (const cmd of commands) {
      // Extract all coordinate points from any command type
      if (cmd.x !== undefined && cmd.y !== undefined) {
        points.push({ x: cmd.x, y: cmd.y });
      }
    }
  } catch (error) {
    console.warn('Failed to parse path with svg-path-parser, falling back to simple parser:', error);
    // Fallback to simple parser for basic commands
    return parsePathSimple(d);
  }
  
  return points;
}

// Fallback simple path parser - extracts M and L commands
function parsePathSimple(d: string): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const commands = d.match(/[MLHVCSQTAZmlhvcsqtaz][^MLHVCSQTAZmlhvcsqtaz]*/g) || [];
  
  let currentX = 0;
  let currentY = 0;
  
  for (const cmd of commands) {
    const type = cmd[0];
    const coords = cmd.slice(1).trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
    
    if (type === 'M' && coords.length >= 2) {
      currentX = coords[0];
      currentY = coords[1];
      points.push({ x: currentX, y: currentY });
    } else if (type === 'L' && coords.length >= 2) {
      currentX = coords[0];
      currentY = coords[1];
      points.push({ x: currentX, y: currentY });
    } else if (type === 'H' && coords.length >= 1) {
      currentX = coords[0];
      points.push({ x: currentX, y: currentY });
    } else if (type === 'V' && coords.length >= 1) {
      currentY = coords[0];
      points.push({ x: currentX, y: currentY });
    }
  }
  
  return points;
}

function samplePath(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const sampled: Array<{ x: number; y: number }> = [];
  if (points.length === 0) return sampled;
  
  sampled.push(points[0]);
  let accumulated = 0;
  
  for (let i = 1; i < points.length; i++) {
    const d = distance(points[i - 1], points[i]);
    accumulated += d;
    if (accumulated >= SAMPLE_DISTANCE) {
      sampled.push(points[i]);
      accumulated = 0;
    }
  }
  
  if (points.length > 1 && sampled[sampled.length - 1] !== points[points.length - 1]) {
    sampled.push(points[points.length - 1]);
  }
  
  return sampled;
}

// Simplified GPS conversion (matches coordinateMapper.ts fallback)
// MUST match the actual SVG viewBox dimensions and GPS corners from coordinateMapper.ts!
function simpleGpsConversion(x: number, y: number): { lat: number; lng: number } {
  // Updated to match actual SVG file: viewBox="0 0 726.77 1643.6"
  const SVG_WIDTH = 726.77;
  const SVG_HEIGHT = 1643.6;

  // Updated to match GPS_CORNERS from coordinateMapper.ts
  const GPS_TOP_LEFT = { lat: -33.85915499, lng: 151.19767695 };      // Northwest corner
  const GPS_TOP_RIGHT = { lat: -33.85915499, lng: 151.23189309 };     // Northeast corner
  const GPS_BOTTOM_LEFT = { lat: -33.90132204, lng: 151.19767695 };   // Southwest corner

  const lng = GPS_TOP_LEFT.lng + (x / SVG_WIDTH) * (GPS_TOP_RIGHT.lng - GPS_TOP_LEFT.lng);
  const lat = GPS_TOP_LEFT.lat - (y / SVG_HEIGHT) * (GPS_TOP_LEFT.lat - GPS_BOTTOM_LEFT.lat);

  return { lat, lng };
}

// Extract street name from element or parent group
// Priority: 1) element's data-street, 2) element's id, 3) parent group ID
function extractStreetNameFromContext(element: string, parentGroupId?: string): string | undefined {
  // First check element's own attributes (data-street or id)
  const elementStreet = extractStreetName(element);
  if (elementStreet) return elementStreet;

  // Fall back to parent group ID (layer name) if exists
  if (parentGroupId) {
    return parentGroupId.replace(/_/g, ' ').trim();
  }

  return undefined;
}

// Extract pre-defined routes from SVG
function extractPredefinedRoutes(svgContent: string): PreDefinedRoute[] {
  const routes: PreDefinedRoute[] = [];

  // Find the predefined-routes group
  const routesGroupRegex = /<g\s+id="predefined-routes"[^>]*>([\s\S]*?)<\/g>/i;
  const routesMatch = svgContent.match(routesGroupRegex);

  if (!routesMatch) {
    console.log('ℹ️  No predefined-routes layer found in SVG');
    return routes;
  }

  const routesContent = routesMatch[1];

  // Find individual route groups with data-from-id and data-to-id
  const routeGroupRegex = /<g\s+[^>]*data-from-id="([^"]+)"[^>]*data-to-id="([^"]+)"[^>]*>([\s\S]*?)<\/g>/gi;
  let match;

  while ((match = routeGroupRegex.exec(routesContent)) !== null) {
    const fromId = match[1];
    const toId = match[2];
    const routeContent = match[3];

    const path: Array<{ x: number; y: number }> = [];
    const streets: string[] = [];

    // Extract all path elements within this route group
    const pathRegex = /<path\s+[^>]*d="([^"]+)"[^>]*>/gi;
    const polylineRegex = /<polyline\s+[^>]*points="([^"]+)"[^>]*>/gi;
    const lineRegex = /<line\s+[^>]*x1="([^"]+)"\s+y1="([^"]+)"\s+x2="([^"]+)"\s+y2="([^"]+)"[^>]*>/gi;

    let pathMatch;

    // Process path elements
    while ((pathMatch = pathRegex.exec(routeContent)) !== null) {
      const fullElement = pathMatch[0];
      const d = pathMatch[1];
      const streetName = extractStreetName(fullElement);

      const points = parsePath(d);
      path.push(...points);

      if (streetName && !streets.includes(streetName)) {
        streets.push(streetName);
      }
    }

    // Process polyline elements
    pathRegex.lastIndex = 0;
    while ((pathMatch = polylineRegex.exec(routeContent)) !== null) {
      const fullElement = pathMatch[0];
      const pointsStr = pathMatch[1];
      const streetName = extractStreetName(fullElement);

      const pointsArray = pointsStr.trim().split(/[\s,]+/);
      for (let i = 0; i < pointsArray.length; i += 2) {
        const x = parseFloat(pointsArray[i]);
        const y = parseFloat(pointsArray[i + 1]);
        if (!isNaN(x) && !isNaN(y)) {
          path.push({ x, y });
        }
      }

      if (streetName && !streets.includes(streetName)) {
        streets.push(streetName);
      }
    }

    // Process line elements
    pathRegex.lastIndex = 0;
    while ((pathMatch = lineRegex.exec(routeContent)) !== null) {
      const fullElement = pathMatch[0];
      const x1 = parseFloat(pathMatch[1]);
      const y1 = parseFloat(pathMatch[2]);
      const x2 = parseFloat(pathMatch[3]);
      const y2 = parseFloat(pathMatch[4]);
      const streetName = extractStreetName(fullElement);

      path.push({ x: x1, y: y1 }, { x: x2, y: y2 });

      if (streetName && !streets.includes(streetName)) {
        streets.push(streetName);
      }
    }

    if (path.length > 0) {
      routes.push({ fromId, toId, path, streets });
      console.log(`✓ Found pre-defined route: ${fromId} → ${toId} (${path.length} points, streets: ${streets.join(', ') || 'none'})`);
    }
  }

  return routes;
}

async function buildGraph(): Promise<PathGraph> {
  console.log('Reading SVG file...');
  const svgPath = path.join(__dirname, '../public/maps/20251028SydneyMap-01.svg');

  console.log('Parsing SVG (Paths, Doors, Rooms layers)...');
  const parsedSVG = await parseSVGMap(svgPath);

  console.log(`✓ Found ${parsedSVG.paths.length} path segments`);
  console.log(`✓ Found ${parsedSVG.rooms.length} rooms`);
  console.log(`✓ Found ${parsedSVG.doors.length} doors`);

  // Count accessible vs non-accessible paths
  const accessiblePaths = parsedSVG.paths.filter(p => p.accessible).length;
  const nonAccessiblePaths = parsedSVG.paths.filter(p => !p.accessible).length;
  console.log(`  - Accessible paths (green): ${accessiblePaths}`);
  console.log(`  - Non-accessible paths (red): ${nonAccessiblePaths}`);

  console.log('\nBuilding navigation graph...');
  const graph = buildGraphFromSVG(parsedSVG);

  console.log(`✓ Created ${Object.keys(graph.nodesById).length} nodes`);
  const totalEdges = Object.values(graph.adjacency).reduce((sum, edges) => sum + edges.length, 0);
  console.log(`✓ Created ${totalEdges} edges`);

  // Add GPS coordinates to nodes
  console.log('\nAdding GPS coordinates...');
  Object.values(graph.nodesById).forEach((node) => {
    const gps = simpleGpsConversion(node.x, node.y);
    node.lat = gps.lat;
    node.lng = gps.lng;
  });

  // Extract pre-defined routes from SVG (if any)
  console.log('\nExtrating pre-defined routes...');
  const svgContent = fs.readFileSync(svgPath, 'utf-8');
  const predefinedRoutes = extractPredefinedRoutes(svgContent);
  if (predefinedRoutes.length > 0) {
    graph.predefinedRoutes = predefinedRoutes;
    console.log(`✅ Found ${predefinedRoutes.length} pre-defined routes\n`);
  }

  // Validation
  console.log('\n=== Graph Quality Validation ===');
  const nodeCount = Object.keys(graph.nodesById).length;
  const avgEdgesPerNode = totalEdges / nodeCount;
  const isolatedNodes = Object.entries(graph.adjacency).filter(([_, edges]) => edges.length === 0);

  console.log(`Total nodes: ${nodeCount}`);
  console.log(`Total edges: ${totalEdges}`);
  console.log(`Average edges per node: ${avgEdgesPerNode.toFixed(2)}`);
  console.log(`Isolated nodes: ${isolatedNodes.length} (${(isolatedNodes.length/nodeCount*100).toFixed(1)}%)`);

  if (isolatedNodes.length > 0) {
    console.log('\n⚠️  WARNING: Isolated nodes detected. These doors/nodes are not connected to the path network:');
    isolatedNodes.slice(0, 5).forEach(([id]) => {
      const node = graph.nodesById[id];
      console.log(`   - ${id} at (${node.x.toFixed(1)}, ${node.y.toFixed(1)})`);
    });
    if (isolatedNodes.length > 5) {
      console.log(`   ... and ${isolatedNodes.length - 5} more`);
    }
  } else {
    console.log('\n✅ No isolated nodes - all doors connected!');
  }
  console.log('================================\n');

  return graph;
}

async function main() {
  try {
    console.log('\n=== Building Street-Level Navigation Graph ===\n');
    const startTime = Date.now();
    
    const graph = await buildGraph();

    const outputPath = path.join(__dirname, '../data/sydney-graph-full.json');
    console.log('\nWriting graph to file...');
    fs.writeFileSync(outputPath, JSON.stringify(graph, null, 2));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Graph built successfully in ${elapsed}s!`);
    console.log(`   Nodes: ${Object.keys(graph.nodesById).length}`);
    console.log(`   Edges: ${Object.values(graph.adjacency).reduce((s, e) => s + e.length, 0)}`);
    console.log(`   Output: ${outputPath}\n`);
  } catch (error) {
    console.error('\n❌ Error building graph:', error);
    process.exit(1);
  }
}

main();
