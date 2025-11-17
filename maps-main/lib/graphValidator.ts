import type { PathGraph } from '@/types';

export interface GraphValidationResult {
  isValid: boolean;
  nodeCount: number;
  edgeCount: number;
  avgEdgesPerNode: number;
  isolatedNodeCount: number;
  isolatedNodePercentage: number;
  connectedComponents: number;
  maxEdgeDistance: number;
  avgEdgeDistance: number;
  medianEdgeDistance: number;
  issues: string[];
  warnings: string[];
}

/**
 * Validates graph quality and connectivity
 * @param graph - The navigation graph to validate
 * @returns Validation result with statistics and issues
 */
export function validateGraph(graph: PathGraph): GraphValidationResult {
  const nodeCount = Object.keys(graph.nodesById).length;
  const issues: string[] = [];
  const warnings: string[] = [];

  // Check if graph is empty
  if (nodeCount === 0) {
    issues.push('Graph is empty - no nodes found');
    return {
      isValid: false,
      nodeCount: 0,
      edgeCount: 0,
      avgEdgesPerNode: 0,
      isolatedNodeCount: 0,
      isolatedNodePercentage: 0,
      connectedComponents: 0,
      maxEdgeDistance: 0,
      avgEdgeDistance: 0,
      medianEdgeDistance: 0,
      issues,
      warnings,
    };
  }

  // Count edges and analyze connectivity
  const adjacencyEntries = Object.entries(graph.adjacency);
  const edgeCount = adjacencyEntries.reduce((sum, [_, edges]) => sum + edges.length, 0);
  const avgEdgesPerNode = edgeCount / nodeCount;

  // Find isolated nodes (0 connections)
  const isolatedNodes = adjacencyEntries.filter(([_, edges]) => edges.length === 0);
  const isolatedNodeCount = isolatedNodes.length;
  const isolatedNodePercentage = (isolatedNodeCount / nodeCount) * 100;

  // Calculate edge distance statistics
  const edgeDistances: number[] = [];
  adjacencyEntries.forEach(([_, edges]) => {
    edges.forEach(edge => {
      edgeDistances.push(edge.distance);
    });
  });

  let maxEdgeDistance = 0;
  let avgEdgeDistance = 0;
  let medianEdgeDistance = 0;

  if (edgeDistances.length > 0) {
    maxEdgeDistance = Math.max(...edgeDistances);
    avgEdgeDistance = edgeDistances.reduce((a, b) => a + b, 0) / edgeDistances.length;
    edgeDistances.sort((a, b) => a - b);
    medianEdgeDistance = edgeDistances[Math.floor(edgeDistances.length / 2)];
  }

  // Count connected components using DFS
  const connectedComponents = countConnectedComponents(graph);

  // Validation checks
  let isValid = true;

  // Critical issues
  if (avgEdgesPerNode < 1.5) {
    issues.push(`Very low connectivity: ${avgEdgesPerNode.toFixed(2)} edges/node (minimum 1.5 required)`);
    isValid = false;
  }

  if (isolatedNodePercentage > 15) {
    issues.push(`Too many isolated nodes: ${isolatedNodeCount} (${isolatedNodePercentage.toFixed(1)}%) - max 15% allowed`);
    isValid = false;
  }

  if (connectedComponents > nodeCount * 0.1) {
    issues.push(`Graph is too fragmented: ${connectedComponents} separate components - most nodes should be connected`);
    isValid = false;
  }

  if (maxEdgeDistance > 2000) {
    issues.push(`Suspiciously long edge: ${maxEdgeDistance.toFixed(1)} units - indicates incorrect connections across map`);
    isValid = false;
  }

  // Warnings (not critical but should be improved)
  if (avgEdgesPerNode < 2.5) {
    warnings.push(`Low connectivity: ${avgEdgesPerNode.toFixed(2)} edges/node (recommended: 3-4+)`);
  }

  if (isolatedNodePercentage > 5) {
    warnings.push(`Many isolated nodes: ${isolatedNodeCount} (${isolatedNodePercentage.toFixed(1)}%) - ideally <5%`);
  }

  if (nodeCount < 500) {
    warnings.push(`Low node count: ${nodeCount} - consider denser sampling for better pathfinding`);
  }

  if (connectedComponents > 1) {
    warnings.push(`Graph has ${connectedComponents} separate components - some areas may be unreachable`);
  }

  return {
    isValid,
    nodeCount,
    edgeCount,
    avgEdgesPerNode,
    isolatedNodeCount,
    isolatedNodePercentage,
    connectedComponents,
    maxEdgeDistance,
    avgEdgeDistance,
    medianEdgeDistance,
    issues,
    warnings,
  };
}

/**
 * Counts the number of connected components in the graph using DFS
 * A connected component is a set of nodes where any node can reach any other node
 */
function countConnectedComponents(graph: PathGraph): number {
  const visited = new Set<string>();
  let componentCount = 0;

  const dfs = (nodeId: string) => {
    visited.add(nodeId);
    const edges = graph.adjacency[nodeId] || [];
    for (const edge of edges) {
      if (!visited.has(edge.to)) {
        dfs(edge.to);
      }
    }
  };

  for (const nodeId of Object.keys(graph.nodesById)) {
    if (!visited.has(nodeId)) {
      componentCount++;
      dfs(nodeId);
    }
  }

  return componentCount;
}

/**
 * Logs validation results to console in a formatted way
 */
export function logValidationResult(result: GraphValidationResult): void {
  console.log('\n=== Graph Validation Results ===');
  console.log(`Status: ${result.isValid ? '✅ VALID' : '❌ INVALID'}`);
  console.log(`\nStatistics:`);
  console.log(`  Nodes: ${result.nodeCount}`);
  console.log(`  Edges: ${result.edgeCount}`);
  console.log(`  Avg edges/node: ${result.avgEdgesPerNode.toFixed(2)}`);
  console.log(`  Isolated nodes: ${result.isolatedNodeCount} (${result.isolatedNodePercentage.toFixed(1)}%)`);
  console.log(`  Connected components: ${result.connectedComponents}`);
  console.log(`\nEdge distances:`);
  console.log(`  Average: ${result.avgEdgeDistance.toFixed(1)} units`);
  console.log(`  Median: ${result.medianEdgeDistance.toFixed(1)} units`);
  console.log(`  Maximum: ${result.maxEdgeDistance.toFixed(1)} units`);

  if (result.issues.length > 0) {
    console.log(`\n❌ CRITICAL ISSUES:`);
    result.issues.forEach(issue => console.log(`   ${issue}`));
  }

  if (result.warnings.length > 0) {
    console.log(`\n⚠️  WARNINGS:`);
    result.warnings.forEach(warning => console.log(`   ${warning}`));
  }

  if (result.isValid && result.warnings.length === 0) {
    console.log(`\n✅ Graph quality is excellent!`);
  }

  console.log('================================\n');
}
