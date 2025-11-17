/**
 * Test your current location transformation
 */

const { gpsToSvg, svgToGps } = require('./coordinate-mapper');
const { gpsToViewBox, viewBoxToRawSvg } = require('./example-usage');

console.log("=== TESTING YOUR CURRENT LOCATION ===\n");

const yourGPS = {
  lat: -33.881628,
  lon: 151.204532
};

const wrongPosition = {
  x: 1496.4343,
  y: 8333.0749
};

const correctPosition = {
  x: 2429.8539,
  y: 14118.3952
};

console.log("YOUR GPS COORDINATES:");
console.log(`  Lat: ${yourGPS.lat}`);
console.log(`  Lon: ${yourGPS.lon}\n`);

console.log("WHAT THE TRANSFORMATION CALCULATES:");
const calculated = gpsToSvg(yourGPS.lat, yourGPS.lon);
console.log(`  Raw SVG: (${calculated.x.toFixed(2)}, ${calculated.y.toFixed(2)})`);

const viewBox = gpsToViewBox(yourGPS.lat, yourGPS.lon);
console.log(`  ViewBox: (${viewBox.x.toFixed(2)}, ${viewBox.y.toFixed(2)})\n`);

console.log("WHERE IT SHOULD BE (from SVG):");
console.log(`  Raw SVG: (${correctPosition.x.toFixed(2)}, ${correctPosition.y.toFixed(2)})\n`);

console.log("WHERE YOUR CODE IS PLACING IT:");
console.log(`  Your code: (${wrongPosition.x.toFixed(2)}, ${wrongPosition.y.toFixed(2)})\n`);

console.log("ERRORS:");
console.log(`  Transformation error: (${Math.abs(calculated.x - correctPosition.x).toFixed(2)}, ${Math.abs(calculated.y - correctPosition.y).toFixed(2)}) px`);
console.log(`  Your code error: (${Math.abs(wrongPosition.x - correctPosition.x).toFixed(2)}, ${Math.abs(wrongPosition.y - correctPosition.y).toFixed(2)}) px\n`);

console.log("=== DIAGNOSIS ===\n");

if (Math.abs(wrongPosition.x - correctPosition.x) > 500 || Math.abs(wrongPosition.y - correctPosition.y) > 500) {
  console.log("❌ PROBLEM: Your code is placing markers in the WRONG location!");
  console.log("   The error is too large to be a transformation issue.\n");

  console.log("POSSIBLE CAUSES:");
  console.log("1. You're not using the transformation functions at all");
  console.log("2. You're mixing up raw SVG coords with ViewBox coords");
  console.log("3. There's a bug in your marker placement code");
  console.log("4. You're applying an extra transform/scale somewhere\n");

  console.log("PLEASE SHARE:");
  console.log("- The code where you convert GPS to SVG coordinates");
  console.log("- The code where you place markers on the map");
  console.log("- Any transforms/scales applied to your SVG element\n");
} else {
  console.log("✅ Your code is working correctly!");
  console.log("   The small error is just from transformation approximation.\n");
}

// Test: What GPS location does the wrong position correspond to?
console.log("=== REVERSE TEST ===\n");
console.log("If we convert your WRONG marker position back to GPS:");
const wrongGPS = svgToGps(wrongPosition.x, wrongPosition.y);
console.log(`  Calculated GPS: (${wrongGPS.lat.toFixed(6)}, ${wrongGPS.lon.toFixed(6)})`);
console.log(`  This is near: ${wrongGPS.lat.toFixed(6)}, ${wrongGPS.lon.toFixed(6)}`);
console.log(`  But you're actually at: ${yourGPS.lat}, ${yourGPS.lon}\n`);

const gpsError = Math.sqrt(
  Math.pow((wrongGPS.lat - yourGPS.lat) * 111000, 2) +
  Math.pow((wrongGPS.lon - yourGPS.lon) * 111000 * Math.cos(yourGPS.lat * Math.PI / 180), 2)
);
console.log(`  Distance error: ~${gpsError.toFixed(0)} meters\n`);
