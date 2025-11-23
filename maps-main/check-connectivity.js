const g = require('./data/sydney-graph-full.json');

function findComponents(graph) {
  const visited = new Set();
  const components = [];

  Object.keys(graph.nodesById).forEach(start => {
    if (visited.has(start)) return;

    const component = [];
    const queue = [start];
    visited.add(start);

    while (queue.length > 0) {
      const node = queue.shift();
      component.push(node);

      const edges = graph.adjacency[node] || [];
      edges.forEach(e => {
        if (!visited.has(e.to)) {
          visited.add(e.to);
          queue.push(e.to);
        }
      });
    }

    components.push(component);
  });

  return components;
}

const components = findComponents(g);
console.log('Disconnected components:', components.length);
components.sort((a, b) => b.length - a.length);
console.log('Largest component:', components[0].length, 'nodes');
console.log('Top 10 component sizes:', components.slice(0, 10).map(c => c.length));

// Calculate percentage of nodes in largest component
const largestPercent = (components[0].length / Object.keys(g.nodesById).length * 100).toFixed(1);
console.log(`Largest component contains ${largestPercent}% of all nodes`);
