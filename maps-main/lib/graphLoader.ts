// Client-side graph loader - loads pre-built graph from JSON
import type { PathGraph } from '@/types';

const MAX_STRAIGHT_EDGE_DISTANCE = 45; // px in viewBox space; prevents shortcuts through buildings

let cachedGraph: PathGraph | null = null;

/**
 * Load and filter the pre-built navigation graph
 * This runs in the browser and loads the JSON file
 */
export async function buildPathNetwork(): Promise<PathGraph> {
  if (cachedGraph) return cachedGraph;

  // Dynamically import the graph data
  const graphData = await import('@/data/sydney-graph-full.json');
  const rawGraph = graphData.default as PathGraph;
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
