/**
 * Scale user's raw SVG coordinates to viewBox coordinates
 */

// User's raw coordinates (from their original source)
const rawCoords = [
  { name: "Sydney Tower Eye", lat: -33.86980521107316, lon: 151.20930207603297, rawX: 4352.2655, rawY: 8583.2275 },
  { name: "Sydney Observatory", lat: -33.85934215409333, lon: 151.20482974792455, rawX: 2698.7583, rawY: 3377.7524 },
  { name: "Haymarket Capital Square", lat: -33.8793433397255, lon: 151.20584716367048, rawX: 3031.4309, rawY: 13298.0103 },
  { name: "Chinese Garden", lat: -33.876359292831864, lon: 151.20280561297912, rawX: 1723.2953, rawY: 11787.0202 },
  { name: "ICC", lat: -33.8748045077514, lon: 151.19951213720176, rawX: 583.6426, rawY: 11281.6897 },
  { name: "ABC", lat: -33.88243350394275, lon: 151.20154831283497, rawX: 1407.2647, rawY: 14839.2331 },
  { name: "Central Station", lat: -33.882599232720864, lon: 151.20649771960913, rawX: 3210.7499, rawY: 15434.0502 },
  { name: "User Current Location", lat: -33.881628, lon: 151.204532, rawX: 2429.8539, rawY: 14118.3952 },
];

// ViewBox dimensions (from actual SVG file)
const viewBox = {
  width: 726.77,
  height: 1643.6
};

// Find min/max of raw coordinates to determine scale
const rawXValues = rawCoords.map(c => c.rawX);
const rawYValues = rawCoords.map(c => c.rawY);

const rawBounds = {
  minX: Math.min(...rawXValues),
  maxX: Math.max(...rawXValues),
  minY: Math.min(...rawYValues),
  maxY: Math.max(...rawYValues),
};

console.log("Raw coordinate bounds:");
console.log(`  X: ${rawBounds.minX.toFixed(2)} to ${rawBounds.maxX.toFixed(2)} (range: ${(rawBounds.maxX - rawBounds.minX).toFixed(2)})`);
console.log(`  Y: ${rawBounds.minY.toFixed(2)} to ${rawBounds.maxY.toFixed(2)} (range: ${(rawBounds.maxY - rawBounds.minY).toFixed(2)})`);

// Calculate scale factors to fit into viewBox
const scaleX = viewBox.width / (rawBounds.maxX - rawBounds.minX);
const scaleY = viewBox.height / (rawBounds.maxY - rawBounds.minY);

console.log("\nScale factors:");
console.log(`  X: ${scaleX.toFixed(6)}`);
console.log(`  Y: ${scaleY.toFixed(6)}`);

// Scale all coordinates to viewBox
console.log("\nScaled coordinates for CustomSydneyMap.tsx:");
console.log("setCalibration([");
rawCoords.forEach(coord => {
  const scaledX = (coord.rawX - rawBounds.minX) * scaleX;
  const scaledY = (coord.rawY - rawBounds.minY) * scaleY;
  console.log(`  { gps: { lat: ${coord.lat}, lng: ${coord.lon} }, svg: { x: ${scaledX.toFixed(4)}, y: ${scaledY.toFixed(4)} } },  // ${coord.name}`);
});
console.log("]);");

console.log("\nCopy the output above into CustomSydneyMap.tsx setCalibration() call");
