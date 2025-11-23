// Graph Builder - Converts parsed SVG data into navigable PathGraph
import type { PathGraph, PathNode } from '@/types';
import type { ParsedSVG, PathLine, Door } from './svgParser';

const SNAP_THRESHOLD = 2; // px - points within this distance are considered the same
const DOOR_CONNECTION_MAX_DISTANCE = 50; // px - max distance to connect door to path

/**
 * Build a PathGraph from parsed SVG data
 */
export function buildGraphFromSVG(parsedSVG: ParsedSVG): PathGraph {
  const { paths, rooms, doors } = parsedSVG;

  // Step 1: Create nodes from path endpoints
  const nodesMap = new Map<string, PathNode>();
  const nodeIdByCoord = new Map<string, string>(); // "x,y" -> nodeId

  // Extract all endpoints from paths
  paths.forEach((pathLine) => {
    addOrGetNode(nodesMap, nodeIdByCoord, pathLine.x1, pathLine.y1, pathLine.streetName);
    addOrGetNode(nodesMap, nodeIdByCoord, pathLine.x2, pathLine.y2, pathLine.streetName);
  });

  // Step 2: Add door nodes
  const doorNodesMap = new Map<string, PathNode>(); // doorId -> node
  doors.forEach((door) => {
    const doorNode: PathNode = {
      id: `door_${door.id}`,
      x: door.midpoint.x,
      y: door.midpoint.y,
      street: `${door.roomId} entrance`,
    };
    nodesMap.set(doorNode.id, doorNode);
    doorNodesMap.set(door.id, doorNode);
  });

  // Step 3: Build adjacency list
  const adjacency: PathGraph['adjacency'] = {};

  // Initialize adjacency for all nodes
  nodesMap.forEach((node) => {
    adjacency[node.id] = [];
  });

  // Add edges from path segments
  paths.forEach((pathLine) => {
    const fromId = getNodeId(nodeIdByCoord, pathLine.x1, pathLine.y1);
    const toId = getNodeId(nodeIdByCoord, pathLine.x2, pathLine.y2);

    if (!fromId || !toId) return;

    const distance = Math.sqrt(
      Math.pow(pathLine.x2 - pathLine.x1, 2) + Math.pow(pathLine.y2 - pathLine.y1, 2)
    );

    // Add edge in both directions (undirected graph)
    adjacency[fromId].push({
      to: toId,
      distance,
      street: pathLine.streetName,
    });

    adjacency[toId].push({
      to: fromId,
      distance,
      street: pathLine.streetName,
    });
  });

  // Step 4: Connect doors to nearest path nodes
  doors.forEach((door) => {
    const doorNode = doorNodesMap.get(door.id);
    if (!doorNode) return;

    // Find nearest path node (not another door)
    const nearestPathNode = findNearestPathNode(
      doorNode,
      nodesMap,
      doorNodesMap,
      DOOR_CONNECTION_MAX_DISTANCE
    );

    if (nearestPathNode) {
      const distance = Math.sqrt(
        Math.pow(nearestPathNode.x - doorNode.x, 2) + Math.pow(nearestPathNode.y - doorNode.y, 2)
      );

      // Connect door to path
      adjacency[doorNode.id].push({
        to: nearestPathNode.id,
        distance,
        street: doorNode.street,
      });

      adjacency[nearestPathNode.id].push({
        to: doorNode.id,
        distance,
        street: doorNode.street,
      });
    }
  });

  // Convert nodes map to record
  const nodesById: Record<string, PathNode> = {};
  nodesMap.forEach((node, id) => {
    nodesById[id] = node;
  });

  return {
    nodesById,
    adjacency,
  };
}

/**
 * Add a node or get existing node ID if it already exists (within SNAP_THRESHOLD)
 */
function addOrGetNode(
  nodesMap: Map<string, PathNode>,
  nodeIdByCoord: Map<string, string>,
  x: number,
  y: number,
  street?: string
): string {
  // Check if a node already exists at this coordinate (with snapping)
  const existingId = findExistingNodeId(nodeIdByCoord, x, y);

  if (existingId) {
    return existingId;
  }

  // Create new node
  const nodeId = `n_${Math.round(x)}_${Math.round(y)}`;
  const node: PathNode = {
    id: nodeId,
    x,
    y,
    street,
  };

  nodesMap.set(nodeId, node);
  nodeIdByCoord.set(coordKey(x, y), nodeId);

  return nodeId;
}

/**
 * Find existing node ID within SNAP_THRESHOLD
 */
function findExistingNodeId(
  nodeIdByCoord: Map<string, string>,
  x: number,
  y: number
): string | null {
  // Check exact coordinate first
  const exactId = nodeIdByCoord.get(coordKey(x, y));
  if (exactId) return exactId;

  // Check nearby coordinates within snap threshold
  for (let dx = -SNAP_THRESHOLD; dx <= SNAP_THRESHOLD; dx++) {
    for (let dy = -SNAP_THRESHOLD; dy <= SNAP_THRESHOLD; dy++) {
      const nearbyId = nodeIdByCoord.get(coordKey(x + dx, y + dy));
      if (nearbyId) return nearbyId;
    }
  }

  return null;
}

/**
 * Get node ID from coordinate
 */
function getNodeId(nodeIdByCoord: Map<string, string>, x: number, y: number): string | null {
  return findExistingNodeId(nodeIdByCoord, x, y);
}

/**
 * Create coordinate key for map lookup
 */
function coordKey(x: number, y: number): string {
  return `${Math.round(x)},${Math.round(y)}`;
}

/**
 * Find nearest path node (excluding door nodes)
 */
function findNearestPathNode(
  doorNode: PathNode,
  allNodes: Map<string, PathNode>,
  doorNodes: Map<string, PathNode>,
  maxDistance: number
): PathNode | null {
  let nearestNode: PathNode | null = null;
  let minDistance = maxDistance;

  allNodes.forEach((node, id) => {
    // Skip door nodes and the current door node itself
    if (doorNodes.has(id.replace('door_', '')) || id === doorNode.id) {
      return;
    }

    const distance = Math.sqrt(
      Math.pow(node.x - doorNode.x, 2) + Math.pow(node.y - doorNode.y, 2)
    );

    if (distance < minDistance) {
      minDistance = distance;
      nearestNode = node;
    }
  });

  return nearestNode;
}

/**
 * Get door node for a room ID
 */
export function getDoorNodeForRoom(
  graph: PathGraph,
  roomId: string
): PathNode | null {
  // Find door node with matching room ID
  const doorNodeId = Object.keys(graph.nodesById).find((id) =>
    id.startsWith(`door_`) && id.includes(roomId)
  );

  if (doorNodeId) {
    return graph.nodesById[doorNodeId];
  }

  return null;
}

/**
 * Get all door nodes for a room ID (rooms can have multiple doors)
 */
export function getAllDoorNodesForRoom(
  graph: PathGraph,
  roomId: string
): PathNode[] {
  const doorNodes: PathNode[] = [];

  Object.entries(graph.nodesById).forEach(([id, node]) => {
    if (id.startsWith(`door_`) && id.includes(roomId)) {
      doorNodes.push(node);
    }
  });

  return doorNodes;
}
