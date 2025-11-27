/**
 * PHASE 3: Pathfinding Web Worker
 *
 * Offloads A* pathfinding computations to a background thread
 * to prevent UI freezes during route calculation.
 *
 * This worker handles both outdoor and indoor pathfinding operations.
 */

import type { PathGraph, PathNode, Intersection } from '@/types';

// Worker message types
interface FindRouteMessage {
  type: 'findRoute';
  id: string;
  graph: PathGraph;
  start: Intersection;
  end: Intersection;
  startPlaceId?: string;
  endPlaceId?: string;
}

interface FindNearestNodeMessage {
  type: 'findNearestNode';
  id: string;
  graph: PathGraph;
  point: { x: number; y: number };
  maxDistance?: number;
}

type WorkerMessage = FindRouteMessage | FindNearestNodeMessage;

interface WorkerResponse {
  id: string;
  type: 'success' | 'error';
  result?: any;
  error?: string;
}

// Import pathfinding functions (these will be bundled with the worker)
// Note: We can't use dynamic imports in workers, so we inline the algorithms

/**
 * A* Heuristic - Euclidean distance
 */
function heuristic(a: PathNode, b: PathNode): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Reconstruct path from A* came-from map
 */
function reconstructPath(cameFrom: Record<string, string | undefined>, currentId: string): string[] {
  const path: string[] = [currentId];
  while (cameFrom[currentId]) {
    currentId = cameFrom[currentId]!;
    path.push(currentId);
  }
  return path.reverse();
}

/**
 * Find nearest node (linear search - worker handles this)
 */
function findNearestNode(
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

  if (best && bestDist <= maxDistance) {
    return best;
  }
  return null;
}

/**
 * A* Pathfinding Algorithm
 */
function findRoute(
  graph: PathGraph,
  start: Intersection,
  end: Intersection
): PathNode[] {
  const startNode = findNearestNode(graph, { x: start.x, y: start.y });
  const endNode = findNearestNode(graph, { x: end.x, y: end.y });

  if (!startNode || !endNode) {
    return [];
  }

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
    // Find node in openSet with lowest fScore
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

  return [];
}

/**
 * BFS Pathfinding (fallback)
 */
function findAnyRoute(
  graph: PathGraph,
  start: Intersection,
  end: Intersection
): PathNode[] {
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
 * Worker message handler
 */
self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  try {
    if (message.type === 'findRoute') {
      const { id, graph, start, end, startPlaceId, endPlaceId } = message;

      // Try A* first
      let route = findRoute(graph, start, end);
      let algorithm: 'astar' | 'bfs' | 'failed' = 'astar';

      // Fallback to BFS if A* fails
      if (route.length < 2) {
        route = findAnyRoute(graph, start, end);
        algorithm = route.length >= 2 ? 'bfs' : 'failed';
      }

      const response: WorkerResponse = {
        id,
        type: 'success',
        result: {
          route,
          algorithm,
          startPlaceId,
          endPlaceId
        }
      };

      self.postMessage(response);
    } else if (message.type === 'findNearestNode') {
      const { id, graph, point, maxDistance } = message;

      const node = findNearestNode(graph, point, maxDistance);

      const response: WorkerResponse = {
        id,
        type: 'success',
        result: node
      };

      self.postMessage(response);
    }
  } catch (error) {
    const response: WorkerResponse = {
      id: message.id,
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    };

    self.postMessage(response);
  }
});

// Signal worker is ready
self.postMessage({ type: 'ready' });
