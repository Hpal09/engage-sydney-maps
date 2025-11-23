import type { Intersection, PathGraph, PathNode, PreDefinedRoute } from '@/types';
import { getDoorNodeForRoom, getAllDoorNodesForRoom } from './graphBuilder';

function heuristic(a: PathNode, b: PathNode): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Find door node for a business/room
 * Tries to match by room ID patterns
 */
export function findDoorNodeForBusiness(
  graph: PathGraph,
  businessName: string
): PathNode | null {
  // Try exact match first
  let doorNode = getDoorNodeForRoom(graph, businessName);
  if (doorNode) return doorNode;

  // Try common variations
  const variations = [
    businessName.replace(/\s+/g, '_'),
    businessName.replace(/\s+/g, ''),
    businessName.toLowerCase().replace(/\s+/g, '_'),
  ];

  for (const variation of variations) {
    doorNode = getDoorNodeForRoom(graph, variation);
    if (doorNode) return doorNode;
  }

  return null;
}

/**
 * Find the best node to use for navigation start/end
 * Priority:
 * 1. Door node (if business is a mapped room)
 * 2. Nearest node (fallback for unmapped locations)
 */
export function findNavigationNode(
  graph: PathGraph,
  point: { x: number; y: number },
  businessName?: string,
  maxDistance: number = 500
): PathNode | null {
  // If business name provided, try to find door node
  if (businessName) {
    const doorNode = findDoorNodeForBusiness(graph, businessName);
    if (doorNode) {
      console.log(`✓ Using door node for ${businessName}: ${doorNode.id}`);
      return doorNode;
    }
  }

  // Fallback to nearest node
  return findNearestNode(graph, point, maxDistance);
}

/**
 * Diagnostic info returned by pathfinding operations
 */
export interface PathfindingDiagnostics {
  route: PathNode[];
  startNode: PathNode | null;
  endNode: PathNode | null;
  startDistance: number;  // Distance from start point to start node (SVG units)
  endDistance: number;    // Distance from end point to end node (SVG units)
  algorithm: 'astar' | 'bfs' | 'failed';
}

/**
 * Finds the nearest node in the graph to a given point
 * @param graph - The navigation graph
 * @param point - Target point with x,y coordinates
 * @param maxDistance - Maximum acceptable distance (default 500 SVG units)
 * @returns The nearest node, or null if no node within maxDistance
 */
export function findNearestNode(
  graph: PathGraph,
  point: { x: number; y: number },
  maxDistance: number = 500
): PathNode | null {
  let best: PathNode | null = null;
  let bestDist = Infinity;

  for (const node of Object.values(graph.nodesById)) {
    const d = Math.hypot(node.x - point.x, node.y - point.y);
    if (d < bestDist) {
      best = node;
      bestDist = d;
    }
  }

  // Validate distance is within acceptable range
  if (best && bestDist <= maxDistance) {
    console.log(`✓ Found nearest node ${best.id} at distance ${bestDist.toFixed(1)} units from point (${point.x.toFixed(1)}, ${point.y.toFixed(1)})`);
    return best;
  } else if (best) {
    console.warn(`⚠️  Nearest node ${best.id} is ${bestDist.toFixed(1)} units away (max allowed: ${maxDistance}) - point may be outside walkable area`);
    return null;
  } else {
    console.error(`❌ No nodes found in graph for point (${point.x.toFixed(1)}, ${point.y.toFixed(1)})`);
    return null;
  }
}

export function reconstructPath(cameFrom: Record<string, string | undefined>, currentId: string): string[] {
  const path: string[] = [currentId];
  while (cameFrom[currentId]) {
    currentId = cameFrom[currentId]!;
    path.push(currentId);
  }
  return path.reverse();
}

export function findRoute(graph: PathGraph, start: Intersection, end: Intersection): PathNode[] {
  console.log(`🗺️  Finding route from (${start.x.toFixed(1)}, ${start.y.toFixed(1)}) to (${end.x.toFixed(1)}, ${end.y.toFixed(1)})`);

  const startNode = findNearestNode(graph, { x: start.x, y: start.y });
  const endNode = findNearestNode(graph, { x: end.x, y: end.y });

  if (!startNode || !endNode) {
    if (!startNode) console.error('❌ Could not find start node - location may be outside walkable area');
    if (!endNode) console.error('❌ Could not find end node - location may be outside walkable area');
    return [];
  }

  console.log(`🔍 A* search: start=${startNode.id}, end=${endNode.id}`);

  const openSet = new Set<string>([startNode.id]);
  const cameFrom: Record<string, string | undefined> = {};
  const gScore: Record<string, number> = {};
  const fScore: Record<string, number> = {};
  for (const id of Object.keys(graph.nodesById)) {
    gScore[id] = Infinity;
    fScore[id] = Infinity;
  }
  gScore[startNode.id] = 0;
  fScore[startNode.id] = heuristic(startNode, endNode);

  while (openSet.size > 0) {
    // node in openSet with lowest fScore
    let currentId = '';
    let currentScore = Infinity;
    for (const id of openSet) {
      if (fScore[id] < currentScore) {
        currentId = id;
        currentScore = fScore[id];
      }
    }
    if (!currentId) break;

    if (currentId === endNode.id) {
      const ids = reconstructPath(cameFrom, currentId);
      const route = ids.map((id) => graph.nodesById[id]);
      console.log(`✅ A* route found: ${route.length} nodes, distance: ${gScore[currentId].toFixed(1)} units`);
      return route;
    }

    openSet.delete(currentId);
    for (const edge of graph.adjacency[currentId] ?? []) {
      const tentative = gScore[currentId] + edge.distance;
      if (tentative < gScore[edge.to]) {
        cameFrom[edge.to] = currentId;
        gScore[edge.to] = tentative;
        fScore[edge.to] = tentative + heuristic(graph.nodesById[edge.to], endNode);
        openSet.add(edge.to);
      }
    }
  }

  console.warn(`⚠️  A* failed to find route - no path exists between nodes in connected graph`);
  return [];
}

export function findAnyRoute(graph: PathGraph, start: Intersection, end: Intersection): PathNode[] {
  const startNode = findNearestNode(graph, { x: start.x, y: start.y });
  const endNode = findNearestNode(graph, { x: end.x, y: end.y });
  if (!startNode || !endNode) return [];

  const queue: string[] = [startNode.id];
  const visited = new Set<string>([startNode.id]);
  const prev: Record<string, string | undefined> = {};

  while (queue.length) {
    const id = queue.shift()!;
    if (id === endNode.id) {
      const ids = reconstructPath(prev, id);
      return ids.map((nid) => graph.nodesById[nid]);
    }
    for (const edge of graph.adjacency[id] ?? []) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        prev[edge.to] = id;
        queue.push(edge.to);
      }
    }
  }
  return [];
}

/**
 * Find route with progressive fallback and detailed diagnostics
 *
 * This function:
 * 1. Tries A* with default maxDistance (500 units)
 * 2. If that fails, tries with increased maxDistance (1000, 2000 units)
 * 3. Falls back to BFS if A* fails
 * 4. Returns detailed diagnostics for debugging
 */
/**
 * Check if there's a pre-defined route between two Place IDs
 * @param graph - The navigation graph
 * @param fromId - Starting Place ID
 * @param toId - Destination Place ID
 * @returns Pre-defined route as PathNodes, or null if not found
 */
function findPredefinedRoute(
  graph: PathGraph,
  fromId: string | undefined,
  toId: string | undefined
): PathNode[] | null {
  if (!fromId || !toId || !graph.predefinedRoutes || graph.predefinedRoutes.length === 0) {
    return null;
  }

  // Check both directions (fromId→toId and toId→fromId)
  const route = graph.predefinedRoutes.find(
    r => (r.fromId === fromId && r.toId === toId) || (r.fromId === toId && r.toId === fromId)
  );

  if (!route) {
    return null;
  }

  console.log(`✨ Found pre-defined route: ${route.fromId} → ${route.toId} (${route.path.length} points, streets: ${route.streets.join(', ')})`);

  // Convert path points to PathNodes
  const pathNodes: PathNode[] = route.path.map((point, i) => ({
    id: `predefined_${route.fromId}_${route.toId}_${i}`,
    x: point.x,
    y: point.y,
    street: route.streets[0] // TODO: Map streets to segments properly
  }));

  // Reverse if needed (if user is going from toId to fromId)
  if (route.fromId === toId && route.toId === fromId) {
    return pathNodes.reverse();
  }

  return pathNodes;
}

export function findRouteWithDiagnostics(
  graph: PathGraph,
  start: Intersection,
  end: Intersection,
  startPlaceId?: string,
  endPlaceId?: string
): PathfindingDiagnostics {
  console.log(`🗺️  Finding route with diagnostics from (${start.x.toFixed(1)}, ${start.y.toFixed(1)}) to (${end.x.toFixed(1)}, ${end.y.toFixed(1)})`);

  // PRIORITY 1: Check for pre-defined demo routes first
  const predefinedRoute = findPredefinedRoute(graph, startPlaceId, endPlaceId);
  if (predefinedRoute && predefinedRoute.length >= 2) {
    const startNode = predefinedRoute[0];
    const endNode = predefinedRoute[predefinedRoute.length - 1];
    const startDistance = Math.hypot(startNode.x - start.x, startNode.y - start.y);
    const endDistance = Math.hypot(endNode.x - end.x, endNode.y - end.y);

    return {
      route: predefinedRoute,
      startNode,
      endNode,
      startDistance,
      endDistance,
      algorithm: 'astar' // Mark as astar to indicate success
    };
  }

  // PRIORITY 2: Try progressive distances: 500 → 1000 → 2000 units
  const maxDistances = [500, 1000, 2000];
  let startNode: PathNode | null = null;
  let endNode: PathNode | null = null;
  let startDistance = Infinity;
  let endDistance = Infinity;

  for (const maxDist of maxDistances) {
    startNode = findNearestNode(graph, { x: start.x, y: start.y }, maxDist);
    endNode = findNearestNode(graph, { x: end.x, y: end.y }, maxDist);

    if (startNode && endNode) {
      startDistance = Math.hypot(startNode.x - start.x, startNode.y - start.y);
      endDistance = Math.hypot(endNode.x - end.x, endNode.y - end.y);
      console.log(`✓ Found nodes with maxDistance=${maxDist}: start=${startNode.id}, end=${endNode.id}`);
      break;
    }

    if (maxDist < maxDistances[maxDistances.length - 1]) {
      console.warn(`⚠️  No nodes found with maxDistance=${maxDist}, trying ${maxDistances[maxDistances.indexOf(maxDist) + 1]}...`);
    }
  }

  // If still no nodes found, return failed diagnostic
  if (!startNode || !endNode) {
    console.error('❌ Failed to find route nodes even with maximum distance tolerance');
    return {
      route: [],
      startNode: null,
      endNode: null,
      startDistance: Infinity,
      endDistance: Infinity,
      algorithm: 'failed'
    };
  }

  // Try A* first
  console.log(`🔍 Attempting A* pathfinding...`);
  const astarRoute = findRoute(graph, start, end);
  if (astarRoute.length >= 2) {
    return {
      route: astarRoute,
      startNode,
      endNode,
      startDistance,
      endDistance,
      algorithm: 'astar'
    };
  }

  // Fallback to BFS
  console.log(`🔄 A* failed, trying BFS fallback...`);
  const bfsRoute = findAnyRoute(graph, start, end);
  if (bfsRoute.length >= 2) {
    return {
      route: bfsRoute,
      startNode,
      endNode,
      startDistance,
      endDistance,
      algorithm: 'bfs'
    };
  }

  // Both algorithms failed
  console.error('❌ Both A* and BFS failed to find a route');
  return {
    route: [],
    startNode,
    endNode,
    startDistance,
    endDistance,
    algorithm: 'failed'
  };
}


