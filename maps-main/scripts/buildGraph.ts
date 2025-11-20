/**
 * Build street-level navigation graph from SVG roads-walkable layer
 * Run with: npx ts-node scripts/buildGraph.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface PathNode {
  id: string;
  x: number;
  y: number;
  lat?: number;
  lng?: number;
  street?: string;
}

interface PathGraph {
  nodesById: Record<string, PathNode>;
  adjacency: Record<string, Array<{ to: string; distance: number; points?: Array<{ x: number; y: number }>; street?: string }>>;
}

const SAMPLE_DISTANCE = 10; // Sample every 10 SVG units (IMPROVED: denser sampling for better path representation)
const DEDUP_THRESHOLD = 5; // Merge nodes within 5 units as duplicates (tight threshold to preserve detail)
const CONNECTION_THRESHOLD = 80; // Connect nodes within 80 units across segments (more permissive to capture valid intersections)

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Extract street name from SVG element's data-street attribute
function extractStreetName(element: string): string | undefined {
  const match = element.match(/data-street="([^"]+)"/i);
  return match ? match[1] : undefined;
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

async function buildGraph(): Promise<PathGraph> {
  console.log('Reading SVG file...');
  const svgPath = path.join(__dirname, '../public/maps/20251028SydneyMap-01.svg');
  const svgContent = fs.readFileSync(svgPath, 'utf-8');

  console.log('Extracting Roads layer...');
  const roadsMatch = svgContent.match(/<g id="Roads">([\s\S]*?)<\/g>/);
  if (!roadsMatch) {
    throw new Error('Could not find Roads layer');
  }

  const roadsLayer = roadsMatch[1];
  const pathRegex = /<path[^>]*\sd="([^"]+)"[^>]*>/gi;
  const lineRegex = /<line[^>]*\sx1="([^"]+)"\s*y1="([^"]+)"\s*x2="([^"]+)"\s*y2="([^"]+)"[^>]*>/gi;
  const polylineRegex = /<polyline[^>]*\spoints="([^"]+)"[^>]*>/gi;
  const polygonRegex = /<polygon[^>]*\spoints="([^"]+)"[^>]*>/gi;

  const allNodes: Array<{ x: number; y: number }> = [];
  const pathSegments: Array<Array<{ x: number; y: number }>> = [];
  const pathStreetNames: Array<string | undefined> = []; // Track street name for each segment

  console.log('Sampling paths...');
  let match;
  let pathCount = 0;
  while ((match = pathRegex.exec(roadsLayer)) !== null) {
    pathCount++;
    const fullElement = match[0]; // Full <path ...> element
    const d = match[1]; // Just the d attribute value
    const streetName = extractStreetName(fullElement);

    const points = parsePath(d);
    const sampled = samplePath(points);
    if (sampled.length > 0) {
      pathSegments.push(sampled);
      pathStreetNames.push(streetName);
      allNodes.push(...sampled);

      if (streetName && pathCount <= 5) {
        console.log(`  Path #${pathCount}: street="${streetName}"`);
      }
    }

    if (pathCount % 100 === 0) {
      console.log(`  Processed ${pathCount} paths...`);
    }
  }
  console.log(`✓ Processed ${pathCount} path elements`);

  // Process line elements
  let lineCount = 0;
  while ((match = lineRegex.exec(roadsLayer)) !== null) {
    lineCount++;
    const fullElement = match[0];
    const streetName = extractStreetName(fullElement);
    const x1 = parseFloat(match[1]);
    const y1 = parseFloat(match[2]);
    const x2 = parseFloat(match[3]);
    const y2 = parseFloat(match[4]);
    const lineSegment = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    pathSegments.push(lineSegment);
    pathStreetNames.push(streetName);
    allNodes.push(...lineSegment);
  }
  console.log(`✓ Processed ${lineCount} line elements`);

  // Process polyline elements
  let polylineCount = 0;
  while ((match = polylineRegex.exec(roadsLayer)) !== null) {
    polylineCount++;
    const fullElement = match[0];
    const streetName = extractStreetName(fullElement);
    const pointsStr = match[1].trim().split(/[\s,]+/);
    const polySegment: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < pointsStr.length; i += 2) {
      const x = parseFloat(pointsStr[i]);
      const y = parseFloat(pointsStr[i + 1]);
      if (!isNaN(x) && !isNaN(y)) {
        const pt = { x, y };
        polySegment.push(pt);
        allNodes.push(pt);
      }
    }
    if (polySegment.length > 0) {
      pathSegments.push(polySegment);
      pathStreetNames.push(streetName);
    }
  }
  console.log(`✓ Processed ${polylineCount} polyline elements`);

  // Process polygon elements
  let polygonCount = 0;
  while ((match = polygonRegex.exec(roadsLayer)) !== null) {
    polygonCount++;
    const pointsStr = match[1].trim().split(/[\s,]+/);
    for (let i = 0; i < pointsStr.length; i += 2) {
      const x = parseFloat(pointsStr[i]);
      const y = parseFloat(pointsStr[i + 1]);
      if (!isNaN(x) && !isNaN(y)) {
        allNodes.push({ x, y });
      }
    }
  }
  console.log(`✓ Processed ${polygonCount} polygon elements`);

  console.log(`\nTotal raw nodes: ${allNodes.length}`);

  // Map each original node to a unique dedup node
  console.log('Deduplicating nodes and mapping segments...');
  const uniqueNodes: Array<{ x: number; y: number }> = [];
  const nodeMapping = new Map<string, { x: number; y: number }>();
  
  for (let i = 0; i < allNodes.length; i++) {
    const node = allNodes[i];
    const key = `${node.x.toFixed(2)},${node.y.toFixed(2)}`;
    
    let mapped = nodeMapping.get(key);
    if (!mapped) {
      const existing = uniqueNodes.find(n => distance(n, node) < DEDUP_THRESHOLD);
      if (existing) {
        mapped = existing;
      } else {
        mapped = node;
        uniqueNodes.push(node);
      }
      nodeMapping.set(key, mapped);
    }
    
    if (i % 1000 === 0 && i > 0) {
      console.log(`  Progress: ${i}/${allNodes.length} (${uniqueNodes.length} unique so far)`);
    }
  }
  console.log(`✓ Unique nodes: ${uniqueNodes.length}`);

  // Create node IDs and convert to GPS
  console.log('Converting to GPS coordinates...');
  const nodesById: Record<string, PathNode> = {};
  uniqueNodes.forEach((node, i) => {
    const id = `node_${i.toString().padStart(5, '0')}`;
    const gps = simpleGpsConversion(node.x, node.y);
    nodesById[id] = {
      id,
      x: node.x,
      y: node.y,
      lat: gps.lat,
      lng: gps.lng,
    };
  });

  // Build adjacency by connecting consecutive nodes in each path segment
  console.log('Building adjacency graph...');
  const adjacency: Record<string, Array<{ to: string; distance: number; points?: Array<{ x: number; y: number }> }>> = {};
  
  // Initialize adjacency for all nodes
  Object.keys(nodesById).forEach(id => {
    adjacency[id] = [];
  });

  // Connect consecutive nodes within each path segment
  const nodeList = Object.values(nodesById);
  const nodeByCoord = new Map<string, PathNode>();
  nodeList.forEach(n => {
    const key = `${n.x.toFixed(2)},${n.y.toFixed(2)}`;
    nodeByCoord.set(key, n);
  });

  for (let segIdx = 0; segIdx < pathSegments.length; segIdx++) {
    const segment = pathSegments[segIdx];
    const streetName = pathStreetNames[segIdx]; // Get street name for this segment

    for (let i = 0; i < segment.length - 1; i++) {
      const pointA = segment[i];
      const pointB = segment[i + 1];

      const keyA = `${pointA.x.toFixed(2)},${pointA.y.toFixed(2)}`;
      const keyB = `${pointB.x.toFixed(2)},${pointB.y.toFixed(2)}`;

      // Map to deduped nodes
      const mappedA = nodeMapping.get(keyA);
      const mappedB = nodeMapping.get(keyB);

      if (!mappedA || !mappedB) continue;

      const mappedKeyA = `${mappedA.x.toFixed(2)},${mappedA.y.toFixed(2)}`;
      const mappedKeyB = `${mappedB.x.toFixed(2)},${mappedB.y.toFixed(2)}`;

      const nodeA = nodeByCoord.get(mappedKeyA);
      const nodeB = nodeByCoord.get(mappedKeyB);

      if (nodeA && nodeB && nodeA.id !== nodeB.id) {
        const dist = distance(nodeA, nodeB);
        if (!adjacency[nodeA.id].some(e => e.to === nodeB.id)) {
          // Store ALL points in the segment between these two nodes
          // This includes the endpoints and any intermediate points
          const segmentPoints = segment.slice(i, i + 2);

          const edgeAtoB = {
            to: nodeB.id,
            distance: dist,
            points: segmentPoints.length >= 2 ? segmentPoints : undefined,
            street: streetName // Add street name to edge
          };

          const edgeBtoA = {
            to: nodeA.id,
            distance: dist,
            points: segmentPoints.length >= 2 ? [...segmentPoints].reverse() : undefined,
            street: streetName // Add street name to edge
          };

          adjacency[nodeA.id].push(edgeAtoB);
          adjacency[nodeB.id].push(edgeBtoA);
        }
      }
    }
  }

  // Connect nearby nodes that are likely at the same intersection
  // This helps connect different path segments that meet at intersections
  for (let i = 0; i < nodeList.length; i++) {
    const nodeA = nodeList[i];
    for (let j = i + 1; j < nodeList.length; j++) {
      const nodeB = nodeList[j];
      const dist = distance(nodeA, nodeB);

      if (dist < CONNECTION_THRESHOLD && dist > 1) {
        // Check if not already connected
        if (!adjacency[nodeA.id].some(e => e.to === nodeB.id)) {
          adjacency[nodeA.id].push({ to: nodeB.id, distance: dist });
          adjacency[nodeB.id].push({ to: nodeA.id, distance: dist });
        }
      }
    }
  }

  const totalEdges = Object.values(adjacency).reduce((sum, edges) => sum + edges.length, 0);
  console.log(`✓ Total edges: ${totalEdges}`);

  // VALIDATION: Analyze graph quality
  console.log('\n=== Graph Quality Validation ===');
  const nodeCount = nodeList.length;
  const avgEdgesPerNode = totalEdges / nodeCount;
  const isolatedNodes = Object.entries(adjacency).filter(([_, edges]) => edges.length === 0);
  const lowConnectivityNodes = Object.entries(adjacency).filter(([_, edges]) => edges.length === 1);

  console.log(`Total nodes: ${nodeCount}`);
  console.log(`Total edges: ${totalEdges}`);
  console.log(`Average edges per node: ${avgEdgesPerNode.toFixed(2)}`);
  console.log(`Isolated nodes (0 connections): ${isolatedNodes.length} (${(isolatedNodes.length/nodeCount*100).toFixed(1)}%)`);
  console.log(`Low connectivity nodes (1 connection): ${lowConnectivityNodes.length} (${(lowConnectivityNodes.length/nodeCount*100).toFixed(1)}%)`);

  // Calculate max edge distance to detect incorrect long-range connections
  let maxEdgeDistance = 0;
  let avgEdgeDistance = 0;
  let edgeDistances: number[] = [];

  Object.values(adjacency).forEach(edges => {
    edges.forEach(edge => {
      if (edge.distance > maxEdgeDistance) maxEdgeDistance = edge.distance;
      edgeDistances.push(edge.distance);
    });
  });

  if (edgeDistances.length > 0) {
    avgEdgeDistance = edgeDistances.reduce((a, b) => a + b, 0) / edgeDistances.length;
    edgeDistances.sort((a, b) => a - b);
    const medianEdgeDistance = edgeDistances[Math.floor(edgeDistances.length / 2)];
    console.log(`Edge distance stats: avg=${avgEdgeDistance.toFixed(1)}, median=${medianEdgeDistance.toFixed(1)}, max=${maxEdgeDistance.toFixed(1)}`);
  }

  // Quality warnings
  const warnings: string[] = [];
  if (avgEdgesPerNode < 2.5) {
    warnings.push(`⚠️  Low connectivity (avg ${avgEdgesPerNode.toFixed(2)} edges/node, should be 3-4+)`);
  }
  if (isolatedNodes.length > nodeCount * 0.05) {
    warnings.push(`⚠️  Too many isolated nodes (${isolatedNodes.length}, should be <5%)`);
  }
  if (maxEdgeDistance > 1000) {
    warnings.push(`⚠️  Suspiciously long edge detected (${maxEdgeDistance.toFixed(1)} units) - may indicate incorrect connections`);
  }
  if (nodeCount < 500) {
    warnings.push(`⚠️  Low node count (${nodeCount}) - consider reducing SAMPLE_DISTANCE for denser graph`);
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  GRAPH QUALITY WARNINGS:');
    warnings.forEach(w => console.log(`   ${w}`));
  } else {
    console.log('\n✅ Graph quality looks good!');
  }
  console.log('================================\n');

  return { nodesById, adjacency };
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
