/**
 * PHASE 4: Build-Time Graph Optimization
 *
 * This script optimizes the navigation graph at build time:
 * 1. Removes duplicate edges
 * 2. Removes self-loops
 * 3. Pre-filters edges by distance (eliminates runtime filtering)
 * 4. Pre-computes spatial index bounds
 * 5. Validates graph integrity
 *
 * Run with: npm run build:graph
 * Output: data/sydney-graph-optimized.json
 */

import fs from 'fs';
import path from 'path';

interface PathNode {
  id: string;
  x: number;
  y: number;
  street?: string;
  lat?: number;
  lng?: number;
}

interface Edge {
  to: string;
  distance: number;
  points?: Array<{ x: number; y: number }>;
  street?: string;
}

interface PathGraph {
  nodesById: Record<string, PathNode>;
  adjacency: Record<string, Edge[]>;
  predefinedRoutes?: any[];
}

interface OptimizedGraph extends PathGraph {
  metadata: {
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
  };
}

const MAX_STRAIGHT_EDGE_DISTANCE = 120; // Same as graphLoader.ts

/**
 * Load raw graph from JSON
 */
function loadGraph(inputPath: string): PathGraph {
  const rawData = fs.readFileSync(inputPath, 'utf-8');
  return JSON.parse(rawData) as PathGraph;
}

/**
 * Calculate graph bounds for spatial indexing
 */
function calculateBounds(graph: PathGraph) {
  const nodes = Object.values(graph.nodesById);

  if (nodes.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  }

  // Add 10% padding for spatial index
  const paddingX = (maxX - minX) * 0.1;
  const paddingY = (maxY - minY) * 0.1;

  return {
    minX: minX - paddingX,
    maxX: maxX + paddingX,
    minY: minY - paddingY,
    maxY: maxY + paddingY,
    width: (maxX - minX) + (2 * paddingX),
    height: (maxY - minY) + (2 * paddingY)
  };
}

/**
 * Optimize graph adjacency lists
 */
function optimizeAdjacency(graph: PathGraph): {
  adjacency: Record<string, Edge[]>;
  stats: {
    duplicatesRemoved: number;
    selfLoopsRemoved: number;
    longEdgesFiltered: number;
  };
} {
  const optimized: Record<string, Edge[]> = {};
  let duplicatesRemoved = 0;
  let selfLoopsRemoved = 0;
  let longEdgesFiltered = 0;

  for (const [nodeId, edges] of Object.entries(graph.adjacency)) {
    const uniqueEdges = new Map<string, Edge>();

    for (const edge of edges) {
      // Skip self-loops
      if (edge.to === nodeId) {
        selfLoopsRemoved++;
        continue;
      }

      // Filter long edges (same logic as graphLoader.ts)
      const hasGeometry = edge.points && edge.points.length >= 2;
      const isWithinDistance = edge.distance <= MAX_STRAIGHT_EDGE_DISTANCE;

      if (!hasGeometry && !isWithinDistance) {
        longEdgesFiltered++;
        continue;
      }

      // Check for duplicates
      const edgeKey = `${edge.to}_${edge.distance.toFixed(2)}`;

      if (uniqueEdges.has(edgeKey)) {
        duplicatesRemoved++;
        continue;
      }

      uniqueEdges.set(edgeKey, edge);
    }

    optimized[nodeId] = Array.from(uniqueEdges.values());
  }

  return {
    adjacency: optimized,
    stats: {
      duplicatesRemoved,
      selfLoopsRemoved,
      longEdgesFiltered
    }
  };
}

/**
 * Validate graph integrity
 */
function validateGraph(graph: PathGraph): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const nodeIds = new Set(Object.keys(graph.nodesById));

  // Check for orphaned edges (pointing to non-existent nodes)
  for (const [nodeId, edges] of Object.entries(graph.adjacency)) {
    if (!nodeIds.has(nodeId)) {
      errors.push(`Adjacency entry for non-existent node: ${nodeId}`);
    }

    for (const edge of edges) {
      if (!nodeIds.has(edge.to)) {
        errors.push(`Edge from ${nodeId} points to non-existent node: ${edge.to}`);
      }
    }
  }

  // Check for nodes without edges
  let nodesWithoutEdges = 0;
  for (const nodeId of nodeIds) {
    const hasOutgoingEdges = graph.adjacency[nodeId] && graph.adjacency[nodeId].length > 0;
    const hasIncomingEdges = Object.values(graph.adjacency).some(edges =>
      edges.some(edge => edge.to === nodeId)
    );

    if (!hasOutgoingEdges && !hasIncomingEdges) {
      nodesWithoutEdges++;
    }
  }

  if (nodesWithoutEdges > 0) {
    errors.push(`Found ${nodesWithoutEdges} isolated nodes (no connections)`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Main optimization function
 */
function optimizeGraph(inputPath: string, outputPath: string): void {
  console.log('📊 PHASE 4: Build-Time Graph Optimization');
  console.log('==========================================\n');

  // Load raw graph
  console.log(`📂 Loading graph from: ${inputPath}`);
  const rawGraph = loadGraph(inputPath);

  const nodeCount = Object.keys(rawGraph.nodesById).length;
  const rawEdgeCount = Object.values(rawGraph.adjacency)
    .reduce((sum, edges) => sum + edges.length, 0);

  console.log(`   Nodes: ${nodeCount}`);
  console.log(`   Edges (before optimization): ${rawEdgeCount}\n`);

  // Calculate bounds
  console.log('📐 Calculating spatial bounds...');
  const bounds = calculateBounds(rawGraph);
  console.log(`   Bounds: (${bounds.minX.toFixed(2)}, ${bounds.minY.toFixed(2)}) to (${bounds.maxX.toFixed(2)}, ${bounds.maxY.toFixed(2)})`);
  console.log(`   Size: ${bounds.width.toFixed(2)} × ${bounds.height.toFixed(2)}\n`);

  // Optimize adjacency lists
  console.log('⚡ Optimizing adjacency lists...');
  const { adjacency, stats } = optimizeAdjacency(rawGraph);

  const optimizedEdgeCount = Object.values(adjacency)
    .reduce((sum, edges) => sum + edges.length, 0);

  console.log(`   ✅ Removed ${stats.duplicatesRemoved} duplicate edges`);
  console.log(`   ✅ Removed ${stats.selfLoopsRemoved} self-loops`);
  console.log(`   ✅ Filtered ${stats.longEdgesFiltered} long edges (>${MAX_STRAIGHT_EDGE_DISTANCE}px)`);
  console.log(`   Edges (after optimization): ${optimizedEdgeCount}\n`);

  // Create optimized graph
  const optimizedGraph: OptimizedGraph = {
    nodesById: rawGraph.nodesById,
    adjacency,
    predefinedRoutes: rawGraph.predefinedRoutes || [],
    metadata: {
      version: '1.0.0',
      optimized: true,
      buildTime: new Date().toISOString(),
      stats: {
        nodes: nodeCount,
        edges: optimizedEdgeCount,
        duplicatesRemoved: stats.duplicatesRemoved,
        selfLoopsRemoved: stats.selfLoopsRemoved,
        longEdgesFiltered: stats.longEdgesFiltered
      },
      bounds
    }
  };

  // Validate
  console.log('🔍 Validating graph integrity...');
  const validation = validateGraph(optimizedGraph);

  if (validation.valid) {
    console.log('   ✅ Graph validation passed\n');
  } else {
    console.log('   ⚠️  Validation warnings:');
    validation.errors.forEach(error => console.log(`      - ${error}`));
    console.log();
  }

  // Write optimized graph
  console.log(`💾 Writing optimized graph to: ${outputPath}`);
  fs.writeFileSync(outputPath, JSON.stringify(optimizedGraph, null, 2));

  const inputSize = fs.statSync(inputPath).size;
  const outputSize = fs.statSync(outputPath).size;
  const savings = ((inputSize - outputSize) / inputSize * 100).toFixed(1);

  console.log(`   Input size: ${(inputSize / 1024).toFixed(1)} KB`);
  console.log(`   Output size: ${(outputSize / 1024).toFixed(1)} KB`);

  if (outputSize < inputSize) {
    console.log(`   💰 Saved: ${savings}% (${((inputSize - outputSize) / 1024).toFixed(1)} KB)\n`);
  } else {
    console.log(`   📊 Size increased by ${(((outputSize - inputSize) / inputSize) * 100).toFixed(1)}% (due to metadata)\n`);
  }

  // Summary
  console.log('✨ Optimization Complete!');
  console.log('==========================================');
  console.log(`Total edges reduced: ${rawEdgeCount - optimizedEdgeCount} (${(((rawEdgeCount - optimizedEdgeCount) / rawEdgeCount) * 100).toFixed(1)}%)`);
  console.log(`Graph is ready for production use.`);
}

// Run optimization
const inputPath = path.join(__dirname, '../data/sydney-graph-full.json');
const outputPath = path.join(__dirname, '../data/sydney-graph-optimized.json');

try {
  optimizeGraph(inputPath, outputPath);
  process.exit(0);
} catch (error) {
  console.error('❌ Error during optimization:', error);
  process.exit(1);
}
