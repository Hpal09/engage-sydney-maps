import type { PathNode, PathGraph } from '@/types';

export function routeToSvgPath(nodes: PathNode[], graph?: PathGraph): string {
  if (!nodes || nodes.length === 0) return '';
  
  const parts: string[] = [];
  parts.push(`M ${nodes[0].x},${nodes[0].y}`);
  
  let usedGeometryCount = 0;
  let fallbackCount = 0;
  
  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1];
    const curr = nodes[i];
    
    // If we have the graph, try to use stored path geometry
    if (graph && graph.adjacency) {
      const edges = graph.adjacency[prev.id];
      if (edges) {
        const edge = edges.find(e => e.to === curr.id);
        
        if (edge?.points && edge.points.length >= 2) {
          // Use stored points to create path (includes endpoints and intermediates)
          // Skip first point as it's already in the path (prev node position)
          for (let j = 1; j < edge.points.length; j++) {
            parts.push(`L ${edge.points[j].x},${edge.points[j].y}`);
          }
          usedGeometryCount++;
          continue;
        }
      }
    }
    
    // Fallback: straight line
    parts.push(`L ${curr.x},${curr.y}`);
    fallbackCount++;
  }
  
  console.log(`[routeDrawer] Used geometry: ${usedGeometryCount}, Fallback: ${fallbackCount}, Graph: ${graph ? 'yes' : 'no'}`);
  
  return parts.join(' ');
}



