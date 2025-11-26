/**
 * Hybrid Pathfinding System
 *
 * Combines outdoor street navigation with indoor floor plan navigation
 * through building entrance portals, creating seamless multi-modal routes.
 */

interface Point {
  x: number;
  y: number;
}

interface GPSPoint {
  lat: number;
  lng: number;
}

interface GraphNode {
  id: string;
  // Location data - either GPS or SVG coordinates depending on node type
  gps?: GPSPoint; // For outdoor nodes and building entrances
  svg?: Point; // For indoor nodes and building entrances
  type: 'outdoor' | 'building-entrance' | 'indoor' | 'floor-transition';
  // Metadata
  buildingId?: string;
  floorId?: string;
  entranceId?: string;
  // Graph connections
  edges: Map<string, number>; // nodeId -> distance/cost
}

interface RouteSegment {
  type: 'outdoor' | 'building-entrance' | 'indoor' | 'floor-transition';
  nodes: Array<{
    gps?: GPSPoint;
    svg?: Point;
    floorId?: string;
    buildingId?: string;
  }>;
  buildingId?: string;
  floorId?: string;
  fromFloorId?: string; // For floor transitions
  toFloorId?: string;
  distance: number;
}

interface HybridRoute {
  segments: RouteSegment[];
  totalDistance: number;
  hasIndoorSegments: boolean;
  buildings: string[]; // List of building IDs on the route
}

interface BuildingEntrance {
  id: string;
  buildingId: string;
  floorId: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  indoorX: number;
  indoorY: number;
  isAccessible: boolean;
}

/**
 * Calculate distance between two GPS coordinates (Haversine formula)
 */
function gpsDistance(p1: GPSPoint, p2: GPSPoint): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLon = (p2.lng - p1.lng) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate distance between two SVG coordinates
 */
function svgDistance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Build a unified graph that connects outdoor and indoor navigation
 */
export async function buildHybridGraph(
  outdoorGraph: Map<string, any>, // Existing outdoor pathfinding graph
  buildingEntrances: BuildingEntrance[],
  indoorGraphs: Map<string, Map<string, any>> // buildingId -> indoor graph
): Promise<Map<string, GraphNode>> {
  const hybridGraph = new Map<string, GraphNode>();

  console.log('🔨 Building hybrid navigation graph...');
  console.log(`📍 Outdoor nodes: ${outdoorGraph.size}`);
  console.log(`🏢 Building entrances: ${buildingEntrances.length}`);
  console.log(`🗺️  Indoor graphs: ${indoorGraphs.size}`);

  // 1. Add all outdoor nodes
  let outdoorCount = 0;
  for (const [nodeId, node] of outdoorGraph.entries()) {
    hybridGraph.set(`outdoor-${nodeId}`, {
      id: `outdoor-${nodeId}`,
      gps: { lat: node.lat, lng: node.lng },
      type: 'outdoor',
      edges: new Map(
        Array.from(node.edges.entries()).map(([targetId, dist]) => [
          `outdoor-${targetId}`,
          dist
        ])
      ),
    });
    outdoorCount++;
  }
  console.log(`✅ Added ${outdoorCount} outdoor nodes`);

  // 2. Add all indoor nodes from each building
  let indoorCount = 0;
  for (const [buildingId, indoorGraph] of indoorGraphs.entries()) {
    for (const [nodeId, node] of indoorGraph.entries()) {
      const hybridNodeId = `indoor-${buildingId}-${nodeId}`;
      hybridGraph.set(hybridNodeId, {
        id: hybridNodeId,
        svg: node.point,
        type: node.type || 'indoor',
        buildingId,
        floorId: node.floorId,
        edges: new Map(
          Array.from(node.edges.entries()).map(([targetId, dist]) => [
            `indoor-${buildingId}-${targetId}`,
            dist
          ])
        ),
      });
      indoorCount++;
    }
  }
  console.log(`✅ Added ${indoorCount} indoor nodes across ${indoorGraphs.size} buildings`);

  // 3. Add building entrance portals and connect outdoor ↔ indoor
  const ENTRANCE_CONNECTION_THRESHOLD = 50; // meters for outdoor, pixels for indoor
  const ENTRANCE_COST = 10; // Small cost for entering/exiting building

  let entranceCount = 0;
  for (const entrance of buildingEntrances) {
    const entranceNodeId = `entrance-${entrance.id}`;

    // Create entrance portal node
    hybridGraph.set(entranceNodeId, {
      id: entranceNodeId,
      gps: { lat: entrance.lat, lng: entrance.lng },
      svg: { x: entrance.indoorX, y: entrance.indoorY },
      type: 'building-entrance',
      buildingId: entrance.buildingId,
      floorId: entrance.floorId,
      entranceId: entrance.id,
      edges: new Map(),
    });

    // Connect to nearby outdoor nodes
    let outdoorConnections = 0;
    for (const [nodeId, node] of hybridGraph.entries()) {
      if (node.type === 'outdoor' && node.gps) {
        const dist = gpsDistance(entrance, node.gps);
        if (dist < ENTRANCE_CONNECTION_THRESHOLD) {
          // Bidirectional connection
          node.edges.set(entranceNodeId, dist + ENTRANCE_COST);
          hybridGraph.get(entranceNodeId)!.edges.set(nodeId, dist + ENTRANCE_COST);
          outdoorConnections++;
        }
      }
    }

    // Connect to nearby indoor nodes on the entrance floor
    let indoorConnections = 0;
    const indoorPrefix = `indoor-${entrance.buildingId}-`;
    for (const [nodeId, node] of hybridGraph.entries()) {
      if (nodeId.startsWith(indoorPrefix) &&
          node.type === 'indoor' &&
          node.floorId === entrance.floorId &&
          node.svg) {
        const dist = svgDistance({ x: entrance.indoorX, y: entrance.indoorY }, node.svg);
        if (dist < ENTRANCE_CONNECTION_THRESHOLD) {
          // Bidirectional connection
          node.edges.set(entranceNodeId, dist + ENTRANCE_COST);
          hybridGraph.get(entranceNodeId)!.edges.set(nodeId, dist + ENTRANCE_COST);
          indoorConnections++;
        }
      }
    }

    console.log(`🚪 Entrance ${entrance.name}: ${outdoorConnections} outdoor + ${indoorConnections} indoor connections`);
    entranceCount++;
  }

  console.log(`✅ Added ${entranceCount} building entrance portals`);
  console.log(`🎯 Hybrid graph complete: ${hybridGraph.size} total nodes`);

  return hybridGraph;
}

/**
 * A* pathfinding on the hybrid graph
 */
function findHybridPath(
  graph: Map<string, GraphNode>,
  startNodeId: string,
  endNodeId: string
): string[] | null {
  const openSet = new Set<string>([startNodeId]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  gScore.set(startNodeId, 0);
  fScore.set(startNodeId, heuristic(graph.get(startNodeId)!, graph.get(endNodeId)!));

  while (openSet.size > 0) {
    // Find node with lowest fScore
    let current: string | null = null;
    let lowestF = Infinity;
    for (const nodeId of openSet) {
      const f = fScore.get(nodeId) ?? Infinity;
      if (f < lowestF) {
        lowestF = f;
        current = nodeId;
      }
    }

    if (!current) break;

    if (current === endNodeId) {
      // Reconstruct path
      const path: string[] = [];
      let curr: string | undefined = current;
      while (curr) {
        path.unshift(curr);
        curr = cameFrom.get(curr);
      }
      return path;
    }

    openSet.delete(current);
    const currentNode = graph.get(current)!;

    for (const [neighborId, edgeCost] of currentNode.edges) {
      const tentativeG = (gScore.get(current) ?? Infinity) + edgeCost;

      if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
        cameFrom.set(neighborId, current);
        gScore.set(neighborId, tentativeG);
        fScore.set(neighborId, tentativeG + heuristic(graph.get(neighborId)!, graph.get(endNodeId)!));
        openSet.add(neighborId);
      }
    }
  }

  return null;
}

/**
 * Heuristic for A* (straight-line distance estimate)
 */
function heuristic(a: GraphNode, b: GraphNode): number {
  // If both have GPS, use GPS distance
  if (a.gps && b.gps) {
    return gpsDistance(a.gps, b.gps);
  }
  // If both have SVG and same building, use SVG distance
  if (a.svg && b.svg && a.buildingId === b.buildingId) {
    return svgDistance(a.svg, b.svg);
  }
  // Mixed or unknown - use large value to prefer actual paths
  return 10000;
}

/**
 * Convert node path to route segments with metadata
 */
function pathToSegments(
  graph: Map<string, GraphNode>,
  nodePath: string[]
): RouteSegment[] {
  const segments: RouteSegment[] = [];
  let currentSegment: RouteSegment | null = null;

  for (let i = 0; i < nodePath.length; i++) {
    const node = graph.get(nodePath[i])!;
    const prevNode = i > 0 ? graph.get(nodePath[i - 1])! : null;

    // Detect segment type change
    const segmentType = node.type;
    const shouldStartNewSegment =
      !currentSegment ||
      currentSegment.type !== segmentType ||
      (segmentType === 'indoor' && currentSegment.floorId !== node.floorId);

    if (shouldStartNewSegment) {
      // Save previous segment
      if (currentSegment) {
        segments.push(currentSegment);
      }

      // Start new segment
      currentSegment = {
        type: segmentType,
        nodes: [],
        buildingId: node.buildingId,
        floorId: node.floorId,
        distance: 0,
      };

      // For floor transitions
      if (segmentType === 'floor-transition' && prevNode) {
        currentSegment.fromFloorId = prevNode.floorId;
        currentSegment.toFloorId = node.floorId;
      }
    }

    // Add node to current segment
    currentSegment!.nodes.push({
      gps: node.gps,
      svg: node.svg,
      floorId: node.floorId,
      buildingId: node.buildingId,
    });

    // Update distance
    if (prevNode && currentSegment) {
      const dist = prevNode.edges.get(node.id) || 0;
      currentSegment.distance += dist;
    }
  }

  // Save final segment
  if (currentSegment) {
    segments.push(currentSegment);
  }

  return segments;
}

/**
 * Find hybrid route from outdoor start to outdoor/indoor destination
 */
export async function findHybridRoute(
  graph: Map<string, GraphNode>,
  start: { lat: number; lng: number } | { buildingId: string; floorId: string; x: number; y: number },
  end: { lat: number; lng: number } | { buildingId: string; floorId: string; x: number; y: number }
): Promise<HybridRoute | null> {
  // Find closest nodes to start and end
  const startNodeId = findClosestNode(graph, start);
  const endNodeId = findClosestNode(graph, end);

  if (!startNodeId || !endNodeId) {
    console.error('Could not find nodes near start/end points');
    return null;
  }

  console.log(`🎯 Hybrid pathfinding: ${startNodeId} → ${endNodeId}`);

  // Run A* on hybrid graph
  const nodePath = findHybridPath(graph, startNodeId, endNodeId);

  if (!nodePath) {
    console.warn('❌ No hybrid route found');
    return null;
  }

  // Convert to route segments
  const segments = pathToSegments(graph, nodePath);
  const totalDistance = segments.reduce((sum, seg) => sum + seg.distance, 0);
  const buildings = [...new Set(segments.map(s => s.buildingId).filter(Boolean))] as string[];

  console.log(`✅ Found hybrid route with ${segments.length} segments, ${nodePath.length} nodes, ${totalDistance.toFixed(1)}m`);
  console.log(`📊 Segment breakdown:`, segments.map(s => `${s.type}(${s.nodes.length})`).join(' → '));

  return {
    segments,
    totalDistance,
    hasIndoorSegments: segments.some(s => s.type === 'indoor' || s.type === 'building-entrance'),
    buildings,
  };
}

/**
 * Find the closest node in the graph to a given point
 */
function findClosestNode(
  graph: Map<string, GraphNode>,
  point: { lat: number; lng: number } | { buildingId: string; floorId: string; x: number; y: number }
): string | null {
  let closestId: string | null = null;
  let minDist = Infinity;

  // GPS-based search
  if ('lat' in point) {
    for (const [nodeId, node] of graph.entries()) {
      if (node.gps) {
        const dist = gpsDistance(point, node.gps);
        if (dist < minDist) {
          minDist = dist;
          closestId = nodeId;
        }
      }
    }
  }
  // Indoor coordinate search
  else {
    for (const [nodeId, node] of graph.entries()) {
      if (node.buildingId === point.buildingId &&
          node.floorId === point.floorId &&
          node.svg) {
        const dist = svgDistance(point, node.svg);
        if (dist < minDist) {
          minDist = dist;
          closestId = nodeId;
        }
      }
    }
  }

  return closestId;
}
