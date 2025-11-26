/**
 * Indoor Pathfinding System
 *
 * Parses SVG paths from floor plans and implements A* pathfinding
 * to navigate between indoor POIs, including multi-floor navigation.
 */

interface Point {
  x: number;
  y: number;
}

interface PathSegment {
  id: string;
  start: Point;
  end: Point;
  length: number;
  floorId?: string; // Track which floor this segment belongs to
}

interface GraphNode {
  id: string;
  point: Point;
  floorId?: string; // Track which floor this node is on
  edges: Map<string, number>; // nodeId -> distance
}

interface PathResult {
  nodes: Point[];
  distance: number;
}

interface MultiFloorPathResult {
  nodes: Array<Point & { floorId?: string }>;
  distance: number;
}

/**
 * Calculate Euclidean distance between two points
 */
function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Check if two points are close enough to be considered the same
 */
function pointsEqual(p1: Point, p2: Point, threshold = 2): boolean {
  return distance(p1, p2) < threshold;
}

/**
 * Parse SVG content to extract path segments from the Paths layer
 */
export function parseSvgPaths(svgContent: string): PathSegment[] {
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');

  // Find the Paths layer
  const pathsLayer = svgDoc.querySelector('#Paths');
  if (!pathsLayer) {
    console.warn('No Paths layer found in SVG');
    return [];
  }

  const segments: PathSegment[] = [];

  // Get all line elements in the Paths layer
  const lines = pathsLayer.querySelectorAll('line');
  lines.forEach((line, index) => {
    const x1 = parseFloat(line.getAttribute('x1') || '0');
    const y1 = parseFloat(line.getAttribute('y1') || '0');
    const x2 = parseFloat(line.getAttribute('x2') || '0');
    const y2 = parseFloat(line.getAttribute('y2') || '0');
    const id = line.getAttribute('id') || `path-${index}`;

    const start = { x: x1, y: y1 };
    const end = { x: x2, y: y2 };

    segments.push({
      id,
      start,
      end,
      length: distance(start, end),
    });
  });

  console.log(`📍 Parsed ${segments.length} path segments from SVG`);
  return segments;
}

/**
 * Build a navigation graph from path segments
 */
export function buildNavigationGraph(segments: PathSegment[]): Map<string, GraphNode> {
  const nodes = new Map<string, GraphNode>();
  let nodeIdCounter = 0;

  // Create a function to find or create a node for a point
  const getOrCreateNode = (point: Point): string => {
    // Check if we already have a node at this point
    for (const [id, node] of nodes.entries()) {
      if (pointsEqual(node.point, point)) {
        return id;
      }
    }

    // Create new node
    const id = `node-${nodeIdCounter++}`;
    nodes.set(id, {
      id,
      point,
      edges: new Map(),
    });
    return id;
  };

  // Build the graph from segments
  segments.forEach(segment => {
    const startNodeId = getOrCreateNode(segment.start);
    const endNodeId = getOrCreateNode(segment.end);

    // Add bidirectional edges
    const startNode = nodes.get(startNodeId)!;
    const endNode = nodes.get(endNodeId)!;

    startNode.edges.set(endNodeId, segment.length);
    endNode.edges.set(startNodeId, segment.length);
  });

  console.log(`🗺️  Built navigation graph with ${nodes.size} nodes`);
  return nodes;
}

/**
 * Find the closest node to a given point
 */
export function findClosestNode(point: Point, graph: Map<string, GraphNode>): string | null {
  let closestId: string | null = null;
  let closestDist = Infinity;

  for (const [id, node] of graph.entries()) {
    const dist = distance(point, node.point);
    if (dist < closestDist) {
      closestDist = dist;
      closestId = id;
    }
  }

  return closestId;
}

/**
 * A* pathfinding algorithm
 */
export function findPath(
  graph: Map<string, GraphNode>,
  startNodeId: string,
  endNodeId: string
): PathResult | null {
  const openSet = new Set<string>([startNodeId]);
  const cameFrom = new Map<string, string>();

  const gScore = new Map<string, number>();
  gScore.set(startNodeId, 0);

  const fScore = new Map<string, number>();
  const startNode = graph.get(startNodeId)!;
  const endNode = graph.get(endNodeId)!;
  fScore.set(startNodeId, distance(startNode.point, endNode.point));

  while (openSet.size > 0) {
    // Find node in openSet with lowest fScore
    let current: string | null = null;
    let lowestF = Infinity;
    for (const id of openSet) {
      const f = fScore.get(id) ?? Infinity;
      if (f < lowestF) {
        lowestF = f;
        current = id;
      }
    }

    if (!current) break;

    // Check if we reached the goal
    if (current === endNodeId) {
      // Reconstruct path
      const path: Point[] = [];
      let curr: string | undefined = current;
      while (curr) {
        const node = graph.get(curr)!;
        path.unshift(node.point);
        curr = cameFrom.get(curr);
      }

      return {
        nodes: path,
        distance: gScore.get(current) ?? 0,
      };
    }

    openSet.delete(current);
    const currentNode = graph.get(current)!;

    // Check all neighbors
    for (const [neighborId, edgeLength] of currentNode.edges) {
      const tentativeG = (gScore.get(current) ?? Infinity) + edgeLength;

      if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
        // This path is better
        cameFrom.set(neighborId, current);
        gScore.set(neighborId, tentativeG);

        const neighborNode = graph.get(neighborId)!;
        const h = distance(neighborNode.point, endNode.point);
        fScore.set(neighborId, tentativeG + h);

        openSet.add(neighborId);
      }
    }
  }

  console.warn('No path found between nodes');
  return null;
}

/**
 * Find a path from one POI to another
 */
export function findPathBetweenPOIs(
  svgContent: string,
  startPOI: { x: number; y: number },
  endPOI: { x: number; y: number }
): PathResult | null {
  // Parse SVG paths and build graph
  const segments = parseSvgPaths(svgContent);
  if (segments.length === 0) {
    console.error('No path segments found in SVG');
    return null;
  }

  const graph = buildNavigationGraph(segments);
  if (graph.size === 0) {
    console.error('Failed to build navigation graph');
    return null;
  }

  // Find closest nodes to start and end POIs
  const startNodeId = findClosestNode(startPOI, graph);
  const endNodeId = findClosestNode(endPOI, graph);

  if (!startNodeId || !endNodeId) {
    console.error('Could not find nodes near POIs');
    return null;
  }

  console.log(`🎯 Finding path from ${startNodeId} to ${endNodeId}`);

  // Find path using A*
  const path = findPath(graph, startNodeId, endNodeId);

  if (path) {
    console.log(`✅ Found path with ${path.nodes.length} nodes, distance: ${path.distance.toFixed(2)}px`);
  } else {
    console.warn('❌ No path found between POIs');
  }

  return path;
}

/**
 * Convert path nodes to SVG path string for rendering
 */
export function pathToSvgString(nodes: Point[]): string {
  if (nodes.length === 0) return '';

  const commands = nodes.map((node, i) => {
    if (i === 0) {
      return `M ${node.x},${node.y}`;
    }
    return `L ${node.x},${node.y}`;
  });

  return commands.join(' ');
}

/**
 * Parse SVG content with floor ID tracking
 */
function parseSvgPathsWithFloor(svgContent: string, floorId: string): PathSegment[] {
  const segments = parseSvgPaths(svgContent);
  return segments.map(seg => ({ ...seg, floorId }));
}

/**
 * Portal connection point for multi-floor navigation
 */
interface Portal {
  id: string; // e.g., "Stair.1" or "Elev.2"
  point: Point; // midpoint of the portal
  floorId: string;
  fullId: string; // full ID from SVG, e.g., "Stair.1.floor1"
}

/**
 * Parse portals (stairs/elevators) from SVG content
 */
function parsePortals(svgContent: string, floorId: string): Portal[] {
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');

  // Find the Portals layer
  const portalsLayer = svgDoc.querySelector('#Portals');
  if (!portalsLayer) {
    console.warn(`No Portals layer found in SVG for floor ${floorId}`);
    return [];
  }

  const portals: Portal[] = [];

  // Get all line elements in the Portals layer
  const lines = portalsLayer.querySelectorAll('line');
  lines.forEach(line => {
    const x1 = parseFloat(line.getAttribute('x1') || '0');
    const y1 = parseFloat(line.getAttribute('y1') || '0');
    const x2 = parseFloat(line.getAttribute('x2') || '0');
    const y2 = parseFloat(line.getAttribute('y2') || '0');
    const fullId = line.getAttribute('id') || '';

    // Extract base portal ID (e.g., "Stair.1.floor2" -> "Stair.1")
    // The pattern is: Type.Number.floorX
    const match = fullId.match(/^((?:Stair|Elev)\.[\d]+)/i);
    if (match) {
      const baseId = match[1];

      // Use the midpoint of the line as the portal location
      const midpoint = {
        x: (x1 + x2) / 2,
        y: (y1 + y2) / 2,
      };

      portals.push({
        id: baseId,
        point: midpoint,
        floorId,
        fullId,
      });

      console.log(`🚪 Found portal: ${fullId} on ${floorId} at (${midpoint.x.toFixed(1)}, ${midpoint.y.toFixed(1)})`);
    }
  });

  return portals;
}

/**
 * Build multi-floor navigation graph with portal-based connections
 */
function buildMultiFloorGraph(
  floorData: Array<{ floorId: string; segments: PathSegment[]; svgContent: string }>
): Map<string, GraphNode> {
  const nodes = new Map<string, GraphNode>();
  let nodeIdCounter = 0;

  // Create a function to find or create a node for a point on a specific floor
  const getOrCreateNode = (point: Point, floorId: string): string => {
    // Check if we already have a node at this point on this floor
    for (const [id, node] of nodes.entries()) {
      if (node.floorId === floorId && pointsEqual(node.point, point)) {
        return id;
      }
    }

    // Create new node
    const id = `node-${floorId}-${nodeIdCounter++}`;
    nodes.set(id, {
      id,
      point,
      floorId,
      edges: new Map(),
    });
    return id;
  };

  // Build graph from segments on each floor
  floorData.forEach(({ floorId, segments }) => {
    segments.forEach(segment => {
      const startNodeId = getOrCreateNode(segment.start, floorId);
      const endNodeId = getOrCreateNode(segment.end, floorId);

      // Add bidirectional edges
      const startNode = nodes.get(startNodeId)!;
      const endNode = nodes.get(endNodeId)!;

      startNode.edges.set(endNodeId, segment.length);
      endNode.edges.set(startNodeId, segment.length);
    });
  });

  // Parse portals from all floors
  const allPortals: Portal[] = [];
  floorData.forEach(({ floorId, svgContent }) => {
    const floorPortals = parsePortals(svgContent, floorId);
    allPortals.push(...floorPortals);
  });

  console.log(`🚪 Found ${allPortals.length} total portals across all floors`);

  // Group portals by their base ID (e.g., "Stair.1", "Elev.2")
  const portalGroups = new Map<string, Portal[]>();
  allPortals.forEach(portal => {
    if (!portalGroups.has(portal.id)) {
      portalGroups.set(portal.id, []);
    }
    portalGroups.get(portal.id)!.push(portal);
  });

  // Create connections between portals with the same base ID on different floors
  const FLOOR_CHANGE_COST = 50; // Cost for using stairs/elevators
  const PORTAL_CONNECTION_THRESHOLD = 100; // Max distance to connect to nearest path node
  let portalConnectionCount = 0;

  portalGroups.forEach((portals, portalId) => {
    if (portals.length < 2) {
      console.warn(`⚠️  Portal ${portalId} only found on one floor - skipping`);
      return;
    }

    console.log(`🔗 Connecting ${portals.length} instances of ${portalId} across floors`);

    // Connect each pair of portals with the same base ID
    for (let i = 0; i < portals.length; i++) {
      for (let j = i + 1; j < portals.length; j++) {
        const portal1 = portals[i];
        const portal2 = portals[j];

        if (portal1.floorId === portal2.floorId) {
          continue; // Skip portals on the same floor
        }

        // Find closest path nodes to each portal
        const nodesOnFloor1 = Array.from(nodes.values()).filter(n => n.floorId === portal1.floorId);
        const nodesOnFloor2 = Array.from(nodes.values()).filter(n => n.floorId === portal2.floorId);

        let closestNode1: GraphNode | null = null;
        let minDist1 = Infinity;
        for (const node of nodesOnFloor1) {
          const dist = distance(node.point, portal1.point);
          if (dist < minDist1 && dist < PORTAL_CONNECTION_THRESHOLD) {
            minDist1 = dist;
            closestNode1 = node;
          }
        }

        let closestNode2: GraphNode | null = null;
        let minDist2 = Infinity;
        for (const node of nodesOnFloor2) {
          const dist = distance(node.point, portal2.point);
          if (dist < minDist2 && dist < PORTAL_CONNECTION_THRESHOLD) {
            minDist2 = dist;
            closestNode2 = node;
          }
        }

        if (closestNode1 && closestNode2) {
          // Create bidirectional connection between the two floors via this portal
          closestNode1.edges.set(closestNode2.id, FLOOR_CHANGE_COST + minDist1 + minDist2);
          closestNode2.edges.set(closestNode1.id, FLOOR_CHANGE_COST + minDist1 + minDist2);
          portalConnectionCount++;
          console.log(`🪜 Portal connection #${portalConnectionCount}: ${portalId} - ${portal1.floorId} ↔ ${portal2.floorId}`);
        } else {
          console.warn(`⚠️  Could not find path nodes near portal ${portalId} on floors ${portal1.floorId}/${portal2.floorId}`);
        }
      }
    }
  });

  console.log(`🗺️  Built multi-floor navigation graph with ${nodes.size} nodes and ${portalConnectionCount} portal connections`);
  return nodes;
}

/**
 * Find path between POIs across multiple floors
 */
export async function findMultiFloorPath(
  floors: Array<{ floorId: string; svgContent: string }>,
  startPOI: { x: number; y: number; floorId: string },
  endPOI: { x: number; y: number; floorId: string }
): Promise<MultiFloorPathResult | null> {
  console.log(`🗺️  Multi-floor pathfinding: ${startPOI.floorId} → ${endPOI.floorId}`);

  // Parse segments from all floors and prepare data for graph building
  const floorData = floors.map(floor => ({
    floorId: floor.floorId,
    segments: parseSvgPathsWithFloor(floor.svgContent, floor.floorId),
    svgContent: floor.svgContent,
  }));

  const totalSegments = floorData.reduce((sum, f) => sum + f.segments.length, 0);
  if (totalSegments === 0) {
    console.error('No path segments found in any floor');
    return null;
  }

  // Build unified multi-floor graph with portal connections
  const graph = buildMultiFloorGraph(floorData);
  if (graph.size === 0) {
    console.error('Failed to build multi-floor navigation graph');
    return null;
  }

  // Find start node on start floor
  const nodesOnStartFloor = Array.from(graph.values()).filter(n => n.floorId === startPOI.floorId);
  let startNodeId: string | null = null;
  let minStartDist = Infinity;
  for (const node of nodesOnStartFloor) {
    const dist = distance(node.point, startPOI);
    if (dist < minStartDist) {
      minStartDist = dist;
      startNodeId = node.id;
    }
  }

  // Find end node on end floor
  const nodesOnEndFloor = Array.from(graph.values()).filter(n => n.floorId === endPOI.floorId);
  let endNodeId: string | null = null;
  let minEndDist = Infinity;
  for (const node of nodesOnEndFloor) {
    const dist = distance(node.point, endPOI);
    if (dist < minEndDist) {
      minEndDist = dist;
      endNodeId = node.id;
    }
  }

  if (!startNodeId || !endNodeId) {
    console.error('Could not find nodes near POIs');
    return null;
  }

  console.log(`🎯 Finding multi-floor path from ${startNodeId} (${startPOI.floorId}) to ${endNodeId} (${endPOI.floorId})`);

  // Run A* on the multi-floor graph
  const path = findPath(graph, startNodeId, endNodeId);

  if (!path) {
    console.warn('❌ No multi-floor path found between POIs');
    return null;
  }

  // Add floor information to each point in the path
  const nodesWithFloors = path.nodes.map(point => {
    // Find which node this corresponds to
    for (const [id, node] of graph.entries()) {
      if (pointsEqual(node.point, point, 0.1)) {
        return { ...point, floorId: node.floorId };
      }
    }
    return { ...point, floorId: undefined };
  });

  console.log(`✅ Found multi-floor path with ${nodesWithFloors.length} nodes, distance: ${path.distance.toFixed(2)}px`);

  return {
    nodes: nodesWithFloors,
    distance: path.distance,
  };
}
