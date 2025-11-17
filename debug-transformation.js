/**
 * Debug tool to identify transformation issues
 */

const { gpsToSvg, svgToGps, transform } = require('./coordinate-mapper');

console.log("=== TRANSFORMATION DEBUG TOOL ===\n");

// Test with the reference points to see the actual errors
const referencePoints = [
  {
    name: "Sydney Tower Eye",
    gps: { lat: -33.86980521107316, lon: 151.20930207603297 },
    svg: { x: 4352.2655, y: 8583.2275 }
  },
  {
    name: "Sydney Observatory",
    gps: { lat: -33.85934215409333, lon: 151.20482974792455 },
    svg: { x: 2698.7583, y: 3377.7524 }
  },
  {
    name: "Haymarket Capital Square",
    gps: { lat: -33.8793433397255, lon: 151.20584716367048 },
    svg: { x: 3031.4309, y: 13298.0103 }
  },
  {
    name: "ICC",
    gps: { lat: -33.8748045077514, lon: 151.19951213720176 },
    svg: { x: 583.6426, y: 11281.6897 }
  }
];

console.log("Testing how far off the markers would appear:\n");

referencePoints.forEach(point => {
  const calculated = gpsToSvg(point.gps.lat, point.gps.lon);
  const errorX = calculated.x - point.svg.x;
  const errorY = calculated.y - point.svg.y;
  const errorDistance = Math.sqrt(errorX * errorX + errorY * errorY);

  console.log(`${point.name}:`);
  console.log(`  Expected SVG: (${point.svg.x.toFixed(2)}, ${point.svg.y.toFixed(2)})`);
  console.log(`  Calculated:   (${calculated.x.toFixed(2)}, ${calculated.y.toFixed(2)})`);
  console.log(`  Offset: X=${errorX.toFixed(2)}px, Y=${errorY.toFixed(2)}px`);
  console.log(`  Distance error: ${errorDistance.toFixed(2)}px`);

  // Convert error to approximate meters (rough estimate for Sydney)
  // At Sydney's latitude, 1 degree ≈ 111km, and we can estimate pixel to degree ratio
  const approxMetersPerPx = 2; // This is a rough estimate
  console.log(`  Approximate real-world error: ~${(errorDistance * approxMetersPerPx).toFixed(0)} meters`);
  console.log();
});

console.log("\n=== POSSIBLE ISSUES ===\n");

console.log("1. Are the SVG coordinates you provided the ACTUAL coordinates from the SVG file?");
console.log("   → Check: Open your SVG, find these landmarks, verify the x,y values\n");

console.log("2. Is there a transform/rotation applied to the map in the SVG?");
console.log("   → Check: Look for <g transform=\"...\"> wrapping the paths\n");

console.log("3. Are you using the correct coordinate system when placing markers?");
console.log("   → Raw SVG coords vs ViewBox coords are different!\n");

console.log("4. Is the Y-axis inverted or the origin in a different place?");
console.log("   → Check: Is (0,0) at top-left or bottom-left of your SVG?\n");

console.log("\n=== NEXT STEPS ===\n");
console.log("Please provide:");
console.log("1. A small section of your SVG file (especially around one landmark)");
console.log("2. How you're currently placing markers (the code)");
console.log("3. Where a marker SHOULD appear vs where it DOES appear (example)\n");

console.log("Example: 'Sydney Tower should be at (400, 500) but appears at (100, 200)'\n");
