/**
 * Verify that business GPS coordinates map correctly to SVG positions
 */

import { BUSINESSES } from '../data/businesses';
import { gpsToSvg, setCalibration } from '../lib/coordinateMapper';
import svgBuildings from '../data/svgBuildings.json';

// Set corrected calibration (same as in CustomSydneyMap.tsx)
// Calculated from known landmark positions in the traced SVG
setCalibration([
  { gps: { lat: -33.85915499, lng: 151.19767695 }, svg: { x: 0, y: 0 } },           // Northwest corner
  { gps: { lat: -33.85915499, lng: 151.23189309 }, svg: { x: 726.77, y: 0 } },      // Northeast corner
  { gps: { lat: -33.90132204, lng: 151.23189309 }, svg: { x: 726.77, y: 1643.6 } }, // Southeast corner
  { gps: { lat: -33.90132204, lng: 151.19767695 }, svg: { x: 0, y: 1643.6 } },      // Southwest corner
]);

console.log('🗺️  Verifying business positions...\n');
console.log('SVG bounds: 726.77 × 1643.6\n');

// Group businesses by area for easy visualization
const businessesByArea: Record<string, typeof BUSINESSES> = {
  'QVB': [],
  'Haymarket/Chinatown': [],
  'Darling Square': [],
  'CBD': [],
  'Other': []
};

BUSINESSES.forEach(business => {
  if (business.name.toLowerCase().includes('qvb') || business.name.toLowerCase().includes('queen victoria')) {
    businessesByArea['QVB'].push(business);
  } else if (business.lat < -33.877 && business.lat > -33.881 && business.lng > 151.203 && business.lng < 151.207) {
    businessesByArea['Haymarket/Chinatown'].push(business);
  } else if (business.name.toLowerCase().includes('darling')) {
    businessesByArea['Darling Square'].push(business);
  } else if (business.lat > -33.875 && business.lat < -33.870) {
    businessesByArea['CBD'].push(business);
  } else {
    businessesByArea['Other'].push(business);
  }
});

// Print each area
Object.entries(businessesByArea).forEach(([area, businesses]) => {
  if (businesses.length === 0) return;

  console.log(`\n=== ${area.toUpperCase()} ===`);
  businesses.forEach(business => {
    const svg = gpsToSvg(business.lat, business.lng);
    const withinBounds = svg.x >= 0 && svg.x <= 726.77 && svg.y >= 0 && svg.y <= 1643.6;
    const icon = withinBounds ? '✅' : '❌';

    console.log(`${icon} ${business.name.padEnd(35)} GPS: (${business.lat.toFixed(4)}, ${business.lng.toFixed(4)}) → SVG: (${svg.x.toFixed(1)}, ${svg.y.toFixed(1)})`);

    // Find nearby SVG buildings
    const nearby = svgBuildings.filter((b: any) => {
      const dist = Math.hypot(b.svgX - svg.x, b.svgY - svg.y);
      return dist < 100; // Within 100 SVG units
    });

    if (nearby.length > 0) {
      console.log(`     Nearby landmarks: ${nearby.map((b: any) => b.name).join(', ')}`);
    }
  });
});

// Print statistics
const totalBusinesses = BUSINESSES.length;
const withinBounds = BUSINESSES.filter(b => {
  const svg = gpsToSvg(b.lat, b.lng);
  return svg.x >= 0 && svg.x <= 726.77 && svg.y >= 0 && svg.y <= 1643.6;
}).length;

console.log(`\n\n📊 Statistics:`);
console.log(`   Total businesses: ${totalBusinesses}`);
console.log(`   Within SVG bounds: ${withinBounds} (${((withinBounds/totalBusinesses)*100).toFixed(1)}%)`);
console.log(`   Outside bounds: ${totalBusinesses - withinBounds}`);

// Compare specific landmarks
console.log(`\n\n🎯 Landmark Comparison (SVG vs GPS):\n`);

const landmarkComparisons = [
  { name: 'Queen Victoria Building', gps: { lat: -33.8718, lng: 151.2067 } },
  { name: 'Darling Square', gps: { lat: -33.8755, lng: 151.2020 } },
  { name: 'Haymarket', gps: { lat: -33.8793, lng: 151.2049 } },
];

landmarkComparisons.forEach(landmark => {
  const gpsToSvgPos = gpsToSvg(landmark.gps.lat, landmark.gps.lng);
  const svgBuilding = svgBuildings.find((b: any) =>
    b.name.toLowerCase().includes(landmark.name.toLowerCase().split(' ')[0])
  );

  console.log(`${landmark.name}:`);
  console.log(`  GPS → SVG:  (${gpsToSvgPos.x.toFixed(1)}, ${gpsToSvgPos.y.toFixed(1)})`);
  if (svgBuilding) {
    console.log(`  SVG traced: (${(svgBuilding as any).svgX.toFixed(1)}, ${(svgBuilding as any).svgY.toFixed(1)})`);
    const diff = Math.hypot((svgBuilding as any).svgX - gpsToSvgPos.x, (svgBuilding as any).svgY - gpsToSvgPos.y);
    console.log(`  Difference: ${diff.toFixed(1)} SVG units`);
  }
  console.log();
});
