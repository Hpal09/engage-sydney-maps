/**
 * Example usage of the coordinate mapper
 */

const { gpsToSvg, svgToGps, transform } = require('./coordinate-mapper');

console.log("=== Example: Converting GPS to SVG Coordinates ===\n");

// Example 1: Convert Circular Quay coordinates to SVG
const circularQuay = {
  name: "Circular Quay",
  lat: -33.861034,
  lon: 151.210873
};

const svgCoords = gpsToSvg(circularQuay.lat, circularQuay.lon);
console.log(`${circularQuay.name}:`);
console.log(`  GPS: (${circularQuay.lat}, ${circularQuay.lon})`);
console.log(`  SVG: (${svgCoords.x.toFixed(2)}, ${svgCoords.y.toFixed(2)})\n`);

// Example 2: Convert Darling Harbour coordinates
const darlingHarbour = {
  name: "Darling Harbour",
  lat: -33.873651,
  lon: 151.201881
};

const svgCoords2 = gpsToSvg(darlingHarbour.lat, darlingHarbour.lon);
console.log(`${darlingHarbour.name}:`);
console.log(`  GPS: (${darlingHarbour.lat}, ${darlingHarbour.lon})`);
console.log(`  SVG: (${svgCoords2.x.toFixed(2)}, ${svgCoords2.y.toFixed(2)})\n`);

// Example 3: Convert SVG coordinates back to GPS
console.log("=== Example: Converting SVG to GPS Coordinates ===\n");

const svgPoint = { x: 3000, y: 10000 };
const gpsCoords = svgToGps(svgPoint.x, svgPoint.y);
console.log(`SVG Point: (${svgPoint.x}, ${svgPoint.y})`);
console.log(`GPS: (${gpsCoords.lat.toFixed(6)}, ${gpsCoords.lon.toFixed(6)})\n`);

// Example 4: Working with the viewBox scale
console.log("=== Scaling from Raw SVG to ViewBox ===\n");

const viewBox = {
  width: 726.77,
  height: 1643.6
};

// Find the bounds of raw SVG coordinates
const rawBounds = {
  minX: 583.6426,
  maxX: 4352.2655,
  minY: 3377.7524,
  maxY: 15434.0502
};

// Calculate scale factor
const scaleX = viewBox.width / (rawBounds.maxX - rawBounds.minX);
const scaleY = viewBox.height / (rawBounds.maxY - rawBounds.minY);

console.log(`Raw SVG bounds: X(${rawBounds.minX} to ${rawBounds.maxX}), Y(${rawBounds.minY} to ${rawBounds.maxY})`);
console.log(`ViewBox size: ${viewBox.width} x ${viewBox.height}`);
console.log(`Scale factors: X=${scaleX.toFixed(6)}, Y=${scaleY.toFixed(6)}\n`);

/**
 * Convert from raw SVG coordinates to viewBox coordinates
 */
function rawSvgToViewBox(rawX, rawY) {
  const x = (rawX - rawBounds.minX) * scaleX;
  const y = (rawY - rawBounds.minY) * scaleY;
  return { x, y };
}

/**
 * Convert from viewBox coordinates to raw SVG coordinates
 */
function viewBoxToRawSvg(viewX, viewY) {
  const x = (viewX / scaleX) + rawBounds.minX;
  const y = (viewY / scaleY) + rawBounds.minY;
  return { x, y };
}

// Example: GPS -> Raw SVG -> ViewBox
const sydneyTower = { lat: -33.86980521107316, lon: 151.20930207603297 };
const rawSvg = gpsToSvg(sydneyTower.lat, sydneyTower.lon);
const viewBoxCoords = rawSvgToViewBox(rawSvg.x, rawSvg.y);

console.log("Sydney Tower Eye transformation:");
console.log(`  GPS: (${sydneyTower.lat}, ${sydneyTower.lon})`);
console.log(`  Raw SVG: (${rawSvg.x.toFixed(2)}, ${rawSvg.y.toFixed(2)})`);
console.log(`  ViewBox: (${viewBoxCoords.x.toFixed(2)}, ${viewBoxCoords.y.toFixed(2)})\n`);

// Complete transformation function
function gpsToViewBox(lat, lon) {
  const raw = gpsToSvg(lat, lon);
  return rawSvgToViewBox(raw.x, raw.y);
}

function viewBoxToGps(viewX, viewY) {
  const raw = viewBoxToRawSvg(viewX, viewY);
  return svgToGps(raw.x, raw.y);
}

console.log("=== Complete Transformation Functions ===");
console.log("Use gpsToViewBox(lat, lon) to convert GPS -> ViewBox coordinates");
console.log("Use viewBoxToGps(x, y) to convert ViewBox -> GPS coordinates\n");

// Test round-trip
const testGps = { lat: -33.870, lon: 151.205 };
const testViewBox = gpsToViewBox(testGps.lat, testGps.lon);
const testGpsBack = viewBoxToGps(testViewBox.x, testViewBox.y);

console.log("Round-trip test:");
console.log(`  Original GPS: (${testGps.lat}, ${testGps.lon})`);
console.log(`  ViewBox: (${testViewBox.x.toFixed(2)}, ${testViewBox.y.toFixed(2)})`);
console.log(`  Back to GPS: (${testGpsBack.lat.toFixed(6)}, ${testGpsBack.lon.toFixed(6)})`);
console.log(`  Error: (${Math.abs(testGpsBack.lat - testGps.lat).toFixed(8)}, ${Math.abs(testGpsBack.lon - testGps.lon).toFixed(8)})\n`);

module.exports = {
  gpsToViewBox,
  viewBoxToGps,
  rawSvgToViewBox,
  viewBoxToRawSvg
};
