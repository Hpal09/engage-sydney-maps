/**
 * Test QVB coordinate mapping
 */

// Simulating the affine transformation from mapCalibration.ts
// Updated to use authoritative coordinates from svgBuildings.json and businesses.ts
const CONTROL_POINTS = [
  { name: 'observatory_building', svgX: 262.96, svgY: 343.01, lat: -33.85972, lng: 151.20472 },
  { name: 'qvb_center', svgX: 335.16, svgY: 943.02, lat: -33.8718, lng: 151.2067 },  // ✅ CORRECTED: Calculated from other control points
  { name: 'tumbalong_park_central_lawn', svgX: 134.21, svgY: 1137.16, lat: -33.8757, lng: 151.20172 },
  { name: 'capitol_theatre_roof', svgX: 328.31, svgY: 1337.15, lat: -33.8797, lng: 151.2067 },
  { name: 'the_exchange_darling_square', svgX: 152.81, svgY: 1248.46, lat: -33.87791401631311, lng: 151.2022219730791 },
  { name: 'terminal_roof', svgX: 481.26, svgY: 251.31, lat: -33.85794, lng: 151.21008 },
];

function solve3x3(matrix, vector) {
  // Clone to avoid mutation
  const m = matrix.map(row => row.slice());
  const b = vector.slice();

  for (let col = 0; col < 3; col++) {
    // Find pivot
    let pivot = col;
    let max = Math.abs(m[col][col]);
    for (let row = col + 1; row < 3; row++) {
      const value = Math.abs(m[row][col]);
      if (value > max) {
        max = value;
        pivot = row;
      }
    }
    if (max === 0) throw new Error('Matrix is singular');

    // Swap rows
    if (pivot !== col) {
      [m[col], m[pivot]] = [m[pivot], m[col]];
      [b[col], b[pivot]] = [b[pivot], b[col]];
    }

    // Normalize pivot row
    const pivotVal = m[col][col];
    for (let c = col; c < 3; c++) {
      m[col][c] /= pivotVal;
    }
    b[col] /= pivotVal;

    // Eliminate column
    for (let row = 0; row < 3; row++) {
      if (row === col) continue;
      const factor = m[row][col];
      if (factor === 0) continue;
      for (let c = col; c < 3; c++) {
        m[row][c] -= factor * m[col][c];
      }
      b[row] -= factor * b[col];
    }
  }

  return b;
}

function computeAffineTransform(points) {
  const ata = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const atx = [0, 0, 0];
  const aty = [0, 0, 0];

  for (const point of points) {
    const row = [point.lng, point.lat, 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        ata[i][j] += row[i] * row[j];
      }
    }
    for (let i = 0; i < 3; i++) {
      atx[i] += row[i] * point.svgX;
      aty[i] += row[i] * point.svgY;
    }
  }

  const [a, b, c] = solve3x3(ata, atx);
  const [d, e, f] = solve3x3(ata, aty);

  return { a, b, c, d, e, f };
}

function latLngToSvgUsingTransform(lat, lng, t) {
  return {
    x: t.a * lng + t.b * lat + t.c,
    y: t.d * lng + t.e * lat + t.f,
  };
}

console.log("=== Testing QVB Coordinate Mapping ===\n");

const transform = computeAffineTransform(CONTROL_POINTS);
console.log("Affine Transform:", transform);
console.log("");

// Test QVB (using corrected coordinates)
const QVB = { lat: -33.8718, lng: 151.2067 };  // ✅ CORRECTED: From businesses.ts
const qvbSvg = latLngToSvgUsingTransform(QVB.lat, QVB.lng, transform);

console.log("QVB GPS:", QVB);
console.log("QVB SVG (calculated):", qvbSvg);
console.log("QVB SVG (expected):", { x: 335.16, y: 943.02 });  // ✅ CORRECTED: Calculated from other control points
console.log("Error:", {
  x: Math.abs(qvbSvg.x - 335.16).toFixed(2) + "px",
  y: Math.abs(qvbSvg.y - 943.02).toFixed(2) + "px"
});
console.log("");

// Test all control points
console.log("=== Control Point Residuals ===\n");
for (const point of CONTROL_POINTS) {
  const projected = latLngToSvgUsingTransform(point.lat, point.lng, transform);
  const dx = projected.x - point.svgX;
  const dy = projected.y - point.svgY;
  const err = Math.hypot(dx, dy);
  console.log(`${point.name}:`);
  console.log(`  Expected: (${point.svgX.toFixed(2)}, ${point.svgY.toFixed(2)})`);
  console.log(`  Got: (${projected.x.toFixed(2)}, ${projected.y.toFixed(2)})`);
  console.log(`  Error: ${err.toFixed(2)}px`);
}

// Test user's actual location
console.log("\n=== User's Actual Location ===\n");
const userGPS = { lat: -33.897054, lng: 151.184157 };
const userSvg = latLngToSvgUsingTransform(userGPS.lat, userGPS.lng, transform);
console.log("User GPS:", userGPS);
console.log("User SVG (calculated):", userSvg);
console.log("Within viewBox (726.77 x 1643.6)?",
  userSvg.x >= 0 && userSvg.x <= 726.77 && userSvg.y >= 0 && userSvg.y <= 1643.6 ? "YES ✓" : "NO ✗"
);
