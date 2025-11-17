// Full street-level graph loader from pre-built sydney-graph-full.json
import type { PathGraph } from '@/types';
import graphData from '@/data/sydney-graph-full.json';

const MAX_STRAIGHT_EDGE_DISTANCE = 45; // px in viewBox space; prevents shortcuts through buildings

let cachedGraph: PathGraph | null = null;

export async function buildPathNetwork(): Promise<PathGraph> {
  if (cachedGraph) return cachedGraph;

  const rawGraph = graphData as PathGraph;
  const cleanedAdjacency: PathGraph['adjacency'] = {};

  Object.entries(rawGraph.adjacency).forEach(([nodeId, edges]) => {
    cleanedAdjacency[nodeId] = edges.filter((edge) => {
      if (edge.points && edge.points.length >= 2) return true; // real geometry from SVG path
      return edge.distance <= MAX_STRAIGHT_EDGE_DISTANCE;
    });
  });

  cachedGraph = {
    nodesById: rawGraph.nodesById,
    adjacency: cleanedAdjacency,
  };

  return cachedGraph;
}

