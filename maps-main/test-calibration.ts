/**
 * Test the new calibration
 */

import { setCalibration, gpsToSvg } from './lib/coordinateMapper';

// Set the calibration (same as in CustomSydneyMap.tsx)
setCalibration([
  { gps: { lat: -33.86980521107316, lng: 151.20930207603297 }, svg: { x: 726.77, y: 709.6473 } },      // Sydney Tower Eye
  { gps: { lat: -33.85934215409333, lng: 151.20482974792455 }, svg: { x: 407.8951, y: 0.0 } },         // Sydney Observatory
  { gps: { lat: -33.8793433397255, lng: 151.20584716367048 }, svg: { x: 472.0502, y: 1352.3999 } },    // Haymarket Capital Square
  { gps: { lat: -33.876359292831864, lng: 151.20280561297912 }, svg: { x: 219.7793, y: 1146.411 } },   // Chinese Garden
  { gps: { lat: -33.8748045077514, lng: 151.19951213720176 }, svg: { x: 0.0, y: 1077.5208 } },         // ICC Sydney
  { gps: { lat: -33.88243350394275, lng: 151.20154831283497 }, svg: { x: 158.8336, y: 1562.5103 } },   // ABC Studios
  { gps: { lat: -33.882599232720864, lng: 151.20649771960913 }, svg: { x: 506.6314, y: 1643.6 } },     // Central Station
  { gps: { lat: -33.881628, lng: 151.204532 }, svg: { x: 356.0375, y: 1464.2406 } },                   // User's verified location
]);

console.log("=== TESTING USER'S CURRENT LOCATION ===\n");

const userGPS = { lat: -33.881628, lon: 151.204532 };
const expectedSVG = { x: 356.0375, y: 1464.2406 };

const calculatedSVG = gpsToSvg(userGPS.lat, userGPS.lon);

console.log("User's GPS:", userGPS);
console.log("Expected SVG:", expectedSVG);
console.log("Calculated SVG:", calculatedSVG);
console.log("Error:", {
  x: Math.abs(calculatedSVG.x - expectedSVG.x).toFixed(4),
  y: Math.abs(calculatedSVG.y - expectedSVG.y).toFixed(4)
});

const withinBounds = calculatedSVG.x >= 0 && calculatedSVG.x <= 726.77 &&
                     calculatedSVG.y >= 0 && calculatedSVG.y <= 1643.6;
console.log("Within viewBox bounds:", withinBounds ? "✅ YES" : "❌ NO");

console.log("\n=== TESTING ALL CALIBRATION POINTS ===\n");

const testPoints = [
  { name: "Sydney Tower Eye", lat: -33.86980521107316, lon: 151.20930207603297, expected: { x: 726.77, y: 709.6473 } },
  { name: "Sydney Observatory", lat: -33.85934215409333, lon: 151.20482974792455, expected: { x: 407.8951, y: 0.0 } },
  { name: "Haymarket Capital Square", lat: -33.8793433397255, lon: 151.20584716367048, expected: { x: 472.0502, y: 1352.3999 } },
  { name: "Chinese Garden", lat: -33.876359292831864, lon: 151.20280561297912, expected: { x: 219.7793, y: 1146.411 } },
  { name: "ICC Sydney", lat: -33.8748045077514, lon: 151.19951213720176, expected: { x: 0.0, y: 1077.5208 } },
  { name: "ABC Studios", lat: -33.88243350394275, lon: 151.20154831283497, expected: { x: 158.8336, y: 1562.5103 } },
  { name: "Central Station", lat: -33.882599232720864, lon: 151.20649771960913, expected: { x: 506.6314, y: 1643.6 } },
];

let totalError = 0;
let maxError = 0;

testPoints.forEach(point => {
  const result = gpsToSvg(point.lat, point.lon);
  const error = Math.sqrt(
    Math.pow(result.x - point.expected.x, 2) +
    Math.pow(result.y - point.expected.y, 2)
  );
  totalError += error;
  maxError = Math.max(maxError, error);

  console.log(`${point.name}:`);
  console.log(`  Expected: (${point.expected.x.toFixed(2)}, ${point.expected.y.toFixed(2)})`);
  console.log(`  Got: (${result.x.toFixed(2)}, ${result.y.toFixed(2)})`);
  console.log(`  Error: ${error.toFixed(4)} pixels`);
  console.log("");
});

console.log("=== SUMMARY ===");
console.log(`Average error: ${(totalError / testPoints.length).toFixed(4)} pixels`);
console.log(`Maximum error: ${maxError.toFixed(4)} pixels`);

if (maxError < 10) {
  console.log("✅ Calibration is EXCELLENT!");
} else if (maxError < 50) {
  console.log("✅ Calibration is GOOD!");
} else {
  console.log("⚠️  Calibration needs improvement");
}
