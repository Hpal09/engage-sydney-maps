/**
 * Calculate correct GPS calibration based on known landmarks
 *
 * We know:
 * 1. QVB GPS: (-33.8718, 151.2067) → should map to SVG (174.6, 495.1)
 * 2. Darling Square GPS: (-33.8755, 151.2020) → should map to SVG (91.1, 632.9)
 * 3. Haymarket GPS: (-33.8793, 151.2049) → should map to SVG (171.2, 787.2)
 *
 * SVG bounds: 726.77 × 1643.6
 *
 * We need to find the GPS coordinates for the four SVG corners: (0, 0), (726.77, 0), (726.77, 1643.6), (0, 1643.6)
 */

interface Point {
  svg: { x: number; y: number };
  gps: { lat: number; lng: number };
}

// Known landmarks with their correct SVG and GPS positions
const knownPoints: Point[] = [
  { svg: { x: 174.6, y: 495.1 }, gps: { lat: -33.8718, lng: 151.2067 } },  // QVB
  { svg: { x: 91.1, y: 632.9 }, gps: { lat: -33.8755, lng: 151.2020 } },    // Darling Square
  { svg: { x: 171.2, y: 787.2 }, gps: { lat: -33.8793, lng: 151.2049 } },   // Haymarket
];

const svgBounds = { width: 726.77, height: 1643.6 };

console.log('🎯 Calculating correct GPS calibration...\n');
console.log('Known landmarks:');
knownPoints.forEach(p => {
  console.log(`  SVG (${p.svg.x.toFixed(1)}, ${p.svg.y.toFixed(1)}) = GPS (${p.gps.lat.toFixed(6)}, ${p.gps.lng.toFixed(6)})`);
});

// Simple linear regression to find GPS → SVG mapping
// We'll use least squares to fit: lat = a*y + b, lng = c*x + d

const n = knownPoints.length;
const sumX = knownPoints.reduce((sum, p) => sum + p.svg.x, 0);
const sumY = knownPoints.reduce((sum, p) => sum + p.svg.y, 0);
const sumLat = knownPoints.reduce((sum, p) => sum + p.gps.lat, 0);
const sumLng = knownPoints.reduce((sum, p) => sum + p.gps.lng, 0);
const sumXLng = knownPoints.reduce((sum, p) => sum + p.svg.x * p.gps.lng, 0);
const sumYLat = knownPoints.reduce((sum, p) => sum + p.svg.y * p.gps.lat, 0);
const sumXX = knownPoints.reduce((sum, p) => sum + p.svg.x * p.svg.x, 0);
const sumYY = knownPoints.reduce((sum, p) => sum + p.svg.y * p.svg.y, 0);

// For lng = c*x + d
const c = (n * sumXLng - sumX * sumLng) / (n * sumXX - sumX * sumX);
const d = (sumLng - c * sumX) / n;

// For lat = a*y + b
const a = (n * sumYLat - sumY * sumLat) / (n * sumYY - sumY * sumY);
const b = (sumLat - a * sumY) / n;

console.log(`\n📐 Linear regression:`);
console.log(`  lng = ${c.toExponential(6)} * x + ${d.toFixed(6)}`);
console.log(`  lat = ${a.toExponential(6)} * y + ${b.toFixed(6)}`);

// Calculate GPS coordinates for the four corners
const corners = [
  { name: 'Top-left (NW)', svg: { x: 0, y: 0 } },
  { name: 'Top-right (NE)', svg: { x: svgBounds.width, y: 0 } },
  { name: 'Bottom-right (SE)', svg: { x: svgBounds.width, y: svgBounds.height } },
  { name: 'Bottom-left (SW)', svg: { x: 0, y: svgBounds.height } },
];

console.log(`\n\n🗺️  CORRECTED GPS CALIBRATION CORNERS:\n`);
console.log(`setCalibration([`);

corners.forEach((corner, i) => {
  const lat = a * corner.svg.y + b;
  const lng = c * corner.svg.x + d;

  const comma = i < corners.length - 1 ? ',' : '';
  console.log(`  { gps: { lat: ${lat.toFixed(8)}, lng: ${lng.toFixed(8)} }, svg: { x: ${corner.svg.x}, y: ${corner.svg.y} } }${comma}  // ${corner.name}`);
});

console.log(`]);\n`);

// Verify accuracy with known points
console.log(`\n✅ Verification (testing with known landmarks):\n`);
knownPoints.forEach((point, idx) => {
  const calculatedLat = a * point.svg.y + b;
  const calculatedLng = c * point.svg.x + d;
  const latError = Math.abs(calculatedLat - point.gps.lat) * 111000; // degrees to meters
  const lngError = Math.abs(calculatedLng - point.gps.lng) * 111000 * Math.cos(point.gps.lat * Math.PI / 180);

  const labels = ['QVB', 'Darling Square', 'Haymarket'];
  console.log(`${labels[idx]}:`);
  console.log(`  Expected: (${point.gps.lat.toFixed(6)}, ${point.gps.lng.toFixed(6)})`);
  console.log(`  Calculated: (${calculatedLat.toFixed(6)}, ${calculatedLng.toFixed(6)})`);
  console.log(`  Error: ${latError.toFixed(1)}m lat, ${lngError.toFixed(1)}m lng\n`);
});

console.log(`\n📋 Geographic coverage:`);
const topLeft = { lat: a * 0 + b, lng: c * 0 + d };
const bottomRight = { lat: a * svgBounds.height + b, lng: c * svgBounds.width + d };

console.log(`  North (top): ${topLeft.lat.toFixed(6)}°`);
console.log(`  South (bottom): ${bottomRight.lat.toFixed(6)}°`);
console.log(`  West (left): ${topLeft.lng.toFixed(6)}°`);
console.log(`  East (right): ${bottomRight.lng.toFixed(6)}°`);

const latSpan = Math.abs(bottomRight.lat - topLeft.lat) * 111000; // meters
const lngSpan = Math.abs(bottomRight.lng - topLeft.lng) * 111000 * Math.cos((topLeft.lat + bottomRight.lat) / 2 * Math.PI / 180); // meters

console.log(`\n  Map dimensions:`);
console.log(`    North-South: ${(latSpan / 1000).toFixed(2)} km`);
console.log(`    East-West: ${(lngSpan / 1000).toFixed(2)} km`);
