// Client-side graph loader - loads pre-built graph from JSON
import type { PathGraph } from '@/types';
import { buildSpatialIndex } from './pathfinding';

let cachedGraph: PathGraph | null = null;

interface OptimizedGraphMetadata {
  version: string;
  optimized: boolean;
  buildTime: string;
  stats: {
    nodes: number;
    edges: number;
    duplicatesRemoved: number;
    selfLoopsRemoved: number;
    longEdgesFiltered: number;
  };
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
  };
}

interface OptimizedGraph extends PathGraph {
  metadata?: OptimizedGraphMetadata;
}

/**
 * Load the pre-built navigation graph
 * PHASE 4: Uses optimized graph with pre-filtered edges and pre-computed bounds
 * No runtime filtering needed - all optimizations done at build time
 */
export async function buildPathNetwork(): Promise<PathGraph> {
  if (cachedGraph) return cachedGraph;

  // PHASE 4: Load optimized graph (falls back to full graph if optimized doesn't exist)
  let graphData;
  let isOptimized = false;

  try {
    graphData = await import('@/data/sydney-graph-optimized.json');
    isOptimized = true;
    console.log('📊 Loaded optimized graph');
  } catch {
    // Fallback to full graph if optimized doesn't exist
    graphData = await import('@/data/sydney-graph-full.json');
    console.log('📊 Loaded full graph (optimization not available)');
  }

  const loadedGraph = graphData.default as OptimizedGraph;

  // No need for runtime filtering - already done at build time for optimized graph
  cachedGraph = {
    nodesById: loadedGraph.nodesById,
    adjacency: loadedGraph.adjacency,
    predefinedRoutes: loadedGraph.predefinedRoutes
  };

  // Log optimization stats if available
  if (isOptimized && loadedGraph.metadata) {
    const { stats, bounds } = loadedGraph.metadata;
    console.log(`   ✨ Pre-optimized: ${stats.nodes} nodes, ${stats.edges} edges`);
    console.log(`   ✨ Removed at build time: ${stats.duplicatesRemoved + stats.selfLoopsRemoved + stats.longEdgesFiltered} edges`);
  }

  // PHASE 2: Build spatial index immediately for fast nearest-node queries
  const useSpatialIndex = process.env.NEXT_PUBLIC_USE_SPATIAL_INDEX !== 'false';
  if (useSpatialIndex) {
    // Use pre-computed bounds from optimized graph if available
    const metaBounds = loadedGraph.metadata?.bounds;
    const bounds = metaBounds ? {
      x: metaBounds.minX,
      y: metaBounds.minY,
      width: metaBounds.width,
      height: metaBounds.height
    } : undefined;

    buildSpatialIndex(cachedGraph, bounds);
    console.log('✨ Spatial index built for outdoor navigation graph');
  }

  return cachedGraph;
}
