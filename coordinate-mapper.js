/**
 * Coordinate Transformation System for Sydney Map
 * Converts between GPS coordinates (lat, lon) and SVG coordinates (x, y)
 */

// Reference points for calibration
// NOTE: This is a legacy standalone version. For production use, see maps-main/lib/mapConfig.ts
// These coordinates appear to be for a different SVG coordinate system (raw SVG vs ViewBox)
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
    name: "Chinese Garden",
    gps: { lat: -33.876359292831864, lon: 151.20280561297912 },
    svg: { x: 1723.2953, y: 11787.0202 }
  },
  {
    name: "ICC",
    gps: { lat: -33.8748045077514, lon: 151.19951213720176 },
    svg: { x: 583.6426, y: 11281.6897 }
  },
  {
    name: "ABC",
    gps: { lat: -33.88243350394275, lon: 151.20154831283497 },
    svg: { x: 1407.2647, y: 14839.2331 }
  },
  {
    name: "Central Station",
    gps: { lat: -33.882599232720864, lon: 151.20649771960913 },
    svg: { x: 3210.7499, y: 15434.0502 }
  },
  {
    name: "User Current Location (Real Test)",
    gps: { lat: -33.881628, lon: 151.204532 },
    svg: { x: 2429.8539, y: 14118.3952 }
  },
  {
    name: "QVB (Queen Victoria Building)",
    gps: { lat: -33.8718, lon: 151.2067 },
    svg: { x: 176.3, y: 472.265 }  // Authoritative coordinates from svgBuildings.json
  }
];

/**
 * Calculate affine transformation parameters using least squares with normalization
 * Transformation: x = a*lon + b*lat + c
 *                 y = d*lon + e*lat + f
 */
function calculateTransformation() {
  const n = referencePoints.length;

  // Find the center point for normalization (improves numerical stability)
  const latitudes = referencePoints.map(p => p.gps.lat);
  const longitudes = referencePoints.map(p => p.gps.lon);

  const latCenter = latitudes.reduce((sum, lat) => sum + lat, 0) / n;
  const lonCenter = longitudes.reduce((sum, lon) => sum + lon, 0) / n;

  // Normalize by subtracting the center
  const normalizedPoints = referencePoints.map(point => ({
    lat: point.gps.lat - latCenter,
    lon: point.gps.lon - lonCenter,
    x: point.svg.x,
    y: point.svg.y
  }));

  // Build matrices for least squares solution
  let sumLon = 0, sumLat = 0, sumX = 0, sumY = 0;
  let sumLon2 = 0, sumLat2 = 0, sumLonLat = 0;
  let sumLonX = 0, sumLatX = 0, sumLonY = 0, sumLatY = 0;

  normalizedPoints.forEach(point => {
    const { lat, lon, x, y } = point;

    sumLon += lon;
    sumLat += lat;
    sumX += x;
    sumY += y;
    sumLon2 += lon * lon;
    sumLat2 += lat * lat;
    sumLonLat += lon * lat;
    sumLonX += lon * x;
    sumLatX += lat * x;
    sumLonY += lon * y;
    sumLatY += lat * y;
  });

  // Calculate determinant
  const denom = n * (sumLon2 * sumLat2 - sumLonLat * sumLonLat) -
                sumLon * (sumLon * sumLat2 - sumLat * sumLonLat) +
                sumLat * (sumLon * sumLonLat - sumLat * sumLon2);

  if (Math.abs(denom) < 1e-10) {
    throw new Error("Matrix is singular, cannot solve for transformation");
  }

  // Solve for x = a*lon + b*lat + c
  const a = (n * (sumLonX * sumLat2 - sumLatX * sumLonLat) -
             sumLon * (sumX * sumLat2 - sumLatX * sumLat) +
             sumLat * (sumX * sumLonLat - sumLonX * sumLat)) / denom;

  const b = (n * (sumLon2 * sumLatX - sumLonLat * sumLonX) -
             sumLon * (sumLon * sumLatX - sumLonX * sumLat) +
             sumLat * (sumLon * sumLonX - sumLon2 * sumX)) / denom;

  const c = (sumX - a * sumLon - b * sumLat) / n;

  // Solve for y = d*lon + e*lat + f
  const d = (n * (sumLonY * sumLat2 - sumLatY * sumLonLat) -
             sumLon * (sumY * sumLat2 - sumLatY * sumLat) +
             sumLat * (sumY * sumLonLat - sumLonY * sumLat)) / denom;

  const e = (n * (sumLon2 * sumLatY - sumLonLat * sumLonY) -
             sumLon * (sumLon * sumLatY - sumLonY * sumLat) +
             sumLat * (sumLon * sumLonY - sumLon2 * sumY)) / denom;

  const f = (sumY - d * sumLon - e * sumLat) / n;

  return { a, b, c, d, e, f, latCenter, lonCenter };
}

// Calculate transformation parameters
const transform = calculateTransformation();

console.log("Transformation Parameters:");
console.log(`x = ${transform.a.toFixed(4)} * lon + ${transform.b.toFixed(4)} * lat + ${transform.c.toFixed(4)}`);
console.log(`y = ${transform.d.toFixed(4)} * lon + ${transform.e.toFixed(4)} * lat + ${transform.f.toFixed(4)}`);

/**
 * Convert GPS coordinates to SVG coordinates
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {{x: number, y: number}} SVG coordinates
 */
function gpsToSvg(lat, lon) {
  // Normalize the input coordinates
  const normLat = lat - transform.latCenter;
  const normLon = lon - transform.lonCenter;

  const x = transform.a * normLon + transform.b * normLat + transform.c;
  const y = transform.d * normLon + transform.e * normLat + transform.f;
  return { x, y };
}

/**
 * Convert SVG coordinates to GPS coordinates
 * @param {number} x - SVG x coordinate
 * @param {number} y - SVG y coordinate
 * @returns {{lat: number, lon: number}} GPS coordinates
 */
function svgToGps(x, y) {
  // Solve the inverse transformation
  // x = a*normLon + b*normLat + c
  // y = d*normLon + e*normLat + f
  // where normLon = lon - lonCenter, normLat = lat - latCenter

  const { a, b, c, d, e, f, latCenter, lonCenter } = transform;
  const determinant = a * e - b * d;

  if (Math.abs(determinant) < 1e-10) {
    throw new Error("Transformation is singular, cannot invert");
  }

  // Using Cramer's rule for the inverse
  const normLon = (e * (x - c) - b * (y - f)) / determinant;
  const normLat = (a * (y - f) - d * (x - c)) / determinant;

  // Convert back to actual GPS coordinates
  const lon = normLon + lonCenter;
  const lat = normLat + latCenter;

  return { lat, lon };
}

// Validate the transformation
console.log("\n=== Validation Results ===");
console.log("Testing transformation accuracy on reference points:\n");

let totalErrorX = 0, totalErrorY = 0;
let maxErrorX = 0, maxErrorY = 0;

referencePoints.forEach(point => {
  const calculated = gpsToSvg(point.gps.lat, point.gps.lon);
  const errorX = Math.abs(calculated.x - point.svg.x);
  const errorY = Math.abs(calculated.y - point.svg.y);

  totalErrorX += errorX;
  totalErrorY += errorY;
  maxErrorX = Math.max(maxErrorX, errorX);
  maxErrorY = Math.max(maxErrorY, errorY);

  console.log(`${point.name}:`);
  console.log(`  Expected: (${point.svg.x.toFixed(2)}, ${point.svg.y.toFixed(2)})`);
  console.log(`  Calculated: (${calculated.x.toFixed(2)}, ${calculated.y.toFixed(2)})`);
  console.log(`  Error: (${errorX.toFixed(4)}, ${errorY.toFixed(4)}) px`);
  console.log("");
});

console.log("=== Error Statistics ===");
console.log(`Average Error: X = ${(totalErrorX / referencePoints.length).toFixed(4)} px, Y = ${(totalErrorY / referencePoints.length).toFixed(4)} px`);
console.log(`Maximum Error: X = ${maxErrorX.toFixed(4)} px, Y = ${maxErrorY.toFixed(4)} px`);

// Test inverse transformation
console.log("\n=== Inverse Transformation Test ===");
const testPoint = referencePoints[0];
const svgCoords = gpsToSvg(testPoint.gps.lat, testPoint.gps.lon);
const gpsBack = svgToGps(svgCoords.x, svgCoords.y);
console.log(`Original GPS: (${testPoint.gps.lat}, ${testPoint.gps.lon})`);
console.log(`Converted back: (${gpsBack.lat}, ${gpsBack.lon})`);
console.log(`Error: lat=${Math.abs(gpsBack.lat - testPoint.gps.lat).toFixed(10)}, lon=${Math.abs(gpsBack.lon - testPoint.gps.lon).toFixed(10)}`);

// Export functions
module.exports = {
  gpsToSvg,
  svgToGps,
  transform,
  referencePoints
};
