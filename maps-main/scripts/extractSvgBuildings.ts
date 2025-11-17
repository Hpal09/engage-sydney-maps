/**
 * Extract building/area positions from SVG
 *
 * This script parses the Sydney map SVG and extracts the centroid (center point)
 * of each named group in the "Rooms" and "Base" layers. These represent the
 * actual traced buildings and areas from Google Maps.
 */

import * as fs from 'fs';
import * as path from 'path';

interface SvgBuilding {
  id: string;
  name: string;
  svgX: number;
  svgY: number;
  layer: 'base' | 'rooms';
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
}

/**
 * Calculate bounding box from SVG path data
 */
function getBBoxFromPath(pathData: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
  // Extract all numbers from the path (coordinates)
  const numbers = pathData.match(/[-+]?[0-9]*\.?[0-9]+/g);
  if (!numbers || numbers.length < 2) return null;

  const coords: number[] = numbers.map(Number);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  // Process pairs of coordinates
  for (let i = 0; i < coords.length - 1; i += 2) {
    const x = coords[i];
    const y = coords[i + 1];
    if (Number.isFinite(x) && Number.isFinite(y)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Calculate bounding box from polygon points
 */
function getBBoxFromPoints(points: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const coords = points.trim().split(/\s+/).map(Number);
  if (coords.length < 2) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (let i = 0; i < coords.length - 1; i += 2) {
    const x = coords[i];
    const y = coords[i + 1];
    if (Number.isFinite(x) && Number.isFinite(y)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Extract all named groups from a layer
 */
function extractGroupsFromLayer(svgContent: string, layerName: string, layerType: 'base' | 'rooms'): SvgBuilding[] {
  const buildings: SvgBuilding[] = [];

  // Find the layer
  const layerRegex = new RegExp(`<g id="${layerName}"[^>]*>([\\s\\S]*?)<\\/g>\\s*<g id="(?:Base|Rooms|Logos)"`, 'm');
  const layerMatch = svgContent.match(layerRegex);

  if (!layerMatch) {
    console.log(`⚠️  Layer "${layerName}" not found`);
    return buildings;
  }

  const layerContent = layerMatch[1];

  // Find all named groups within the layer
  const groupRegex = /<g id="([^"]+)"(?:\s+data-name="([^"]+)")?[^>]*>([\s\S]*?)<\/g>/g;
  let match;

  while ((match = groupRegex.exec(layerContent)) !== null) {
    const id = match[1];
    const dataName = match[2] || id.replace(/_/g, ' ');
    const groupContent = match[3];

    // Skip utility groups
    if (id.startsWith('Layer_') || id === 'Roads' || id === 'Street_names') {
      continue;
    }

    // Calculate bounding box from all paths/polygons in the group
    let bbox: { minX: number; minY: number; maxX: number; maxY: number } | null = null;

    // Extract paths
    const pathRegex = /<path[^>]+d="([^"]+)"/g;
    let pathMatch;
    while ((pathMatch = pathRegex.exec(groupContent)) !== null) {
      const pathBBox = getBBoxFromPath(pathMatch[1]);
      if (pathBBox) {
        if (!bbox) {
          bbox = pathBBox;
        } else {
          bbox.minX = Math.min(bbox.minX, pathBBox.minX);
          bbox.minY = Math.min(bbox.minY, pathBBox.minY);
          bbox.maxX = Math.max(bbox.maxX, pathBBox.maxX);
          bbox.maxY = Math.max(bbox.maxY, pathBBox.maxY);
        }
      }
    }

    // Extract polygons
    const polygonRegex = /<polygon[^>]+points="([^"]+)"/g;
    let polygonMatch;
    while ((polygonMatch = polygonRegex.exec(groupContent)) !== null) {
      const polygonBBox = getBBoxFromPoints(polygonMatch[1]);
      if (polygonBBox) {
        if (!bbox) {
          bbox = polygonBBox;
        } else {
          bbox.minX = Math.min(bbox.minX, polygonBBox.minX);
          bbox.minY = Math.min(bbox.minY, polygonBBox.minY);
          bbox.maxX = Math.max(bbox.maxX, polygonBBox.maxX);
          bbox.maxY = Math.max(bbox.maxY, polygonBBox.maxY);
        }
      }
    }

    // Extract circles
    const circleRegex = /<circle[^>]+cx="([^"]+)"\s+cy="([^"]+)"\s+r="([^"]+)"/g;
    let circleMatch;
    while ((circleMatch = circleRegex.exec(groupContent)) !== null) {
      const cx = parseFloat(circleMatch[1]);
      const cy = parseFloat(circleMatch[2]);
      const r = parseFloat(circleMatch[3]);

      if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(r)) {
        const circleBBox = {
          minX: cx - r,
          minY: cy - r,
          maxX: cx + r,
          maxY: cy + r
        };

        if (!bbox) {
          bbox = circleBBox;
        } else {
          bbox.minX = Math.min(bbox.minX, circleBBox.minX);
          bbox.minY = Math.min(bbox.minY, circleBBox.minY);
          bbox.maxX = Math.max(bbox.maxX, circleBBox.maxX);
          bbox.maxY = Math.max(bbox.maxY, circleBBox.maxY);
        }
      }
    }

    if (bbox) {
      // Calculate centroid
      const svgX = (bbox.minX + bbox.maxX) / 2;
      const svgY = (bbox.minY + bbox.maxY) / 2;

      buildings.push({
        id,
        name: dataName,
        svgX,
        svgY,
        layer: layerType,
        bbox
      });
    }
  }

  return buildings;
}

/**
 * Main extraction function
 */
function extractBuildings() {
  const svgPath = path.join(__dirname, '../public/maps/20251028SydneyMap-01.svg');
  const svgContent = fs.readFileSync(svgPath, 'utf-8');

  console.log('🗺️  Extracting buildings from SVG...\n');

  // Extract from both layers
  const baseBuildings = extractGroupsFromLayer(svgContent, 'Base', 'base');
  const roomBuildings = extractGroupsFromLayer(svgContent, 'Rooms', 'rooms');

  const allBuildings = [...baseBuildings, ...roomBuildings];

  console.log(`\n✅ Extracted ${allBuildings.length} buildings/areas:`);
  console.log(`   - Base layer: ${baseBuildings.length}`);
  console.log(`   - Rooms layer: ${roomBuildings.length}\n`);

  // Sort by name
  allBuildings.sort((a, b) => a.name.localeCompare(b.name));

  // Save to JSON file
  const outputPath = path.join(__dirname, '../data/svgBuildings.json');
  fs.writeFileSync(outputPath, JSON.stringify(allBuildings, null, 2));

  console.log(`💾 Saved to: ${outputPath}\n`);

  // Print sample entries
  console.log('📋 Sample entries:');
  allBuildings.slice(0, 10).forEach(building => {
    console.log(`   ${building.name.padEnd(40)} → (${building.svgX.toFixed(1)}, ${building.svgY.toFixed(1)})`);
  });

  // Print specific landmarks
  console.log('\n🎯 Key landmarks:');
  ['Queen Victoria', 'Darling Square', 'Haymarket', 'The Rocks', 'Circular Quay'].forEach(landmark => {
    const found = allBuildings.filter(b => b.name.toLowerCase().includes(landmark.toLowerCase()));
    found.forEach(b => {
      console.log(`   ${b.name.padEnd(40)} → (${b.svgX.toFixed(1)}, ${b.svgY.toFixed(1)}) [${b.layer}]`);
    });
  });
}

// Run extraction
extractBuildings();
