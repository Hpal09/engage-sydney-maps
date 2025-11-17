/**
 * Comprehensive test of coordinate mapping
 */

// Simulating the affine transformation
// Updated to use consistent coordinates across all control points
const CONTROL_POINTS = [
  { name: 'observatory_building', svgX: 262.96, svgY: 343.01, lat: -33.85972, lng: 151.20472 },
  { name: 'qvb_center', svgX: 335.16, svgY: 943.02, lat: -33.8718, lng: 151.2067 },  // ✅ CORRECTED: Calculated from other control points
  { name: 'tumbalong_park_central_lawn', svgX: 134.21, svgY: 1137.16, lat: -33.8757, lng: 151.20172 },
  { name: 'capitol_theatre_roof', svgX: 328.31, svgY: 1337.15, lat: -33.8797, lng: 151.2067 },
  { name: 'the_exchange_darling_square', svgX: 152.81, svgY: 1248.46, lat: -33.87791401631311, lng: 151.2022219730791 },
  { name: 'terminal_roof', svgX: 481.26, svgY: 251.31, lat: -33.85794, lng: 151.21008 },
];

function solve3x3(matrix, vector) {
  const m = matrix.map(row => row.slice());
  const b = vector.slice();

  for (let col = 0; col < 3; col++) {
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

    if (pivot !== col) {
      [m[col], m[pivot]] = [m[pivot], m[col]];
      [b[col], b[pivot]] = [b[pivot], b[col]];
    }

    const pivotVal = m[col][col];
    for (let c = col; c < 3; c++) {
      m[col][c] /= pivotVal;
    }
    b[col] /= pivotVal;

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

const VIEWBOX = { width: 726.77, height: 1643.6 };

console.log("=== COORDINATE MAPPING TEST ===\n");
console.log("ViewBox:", VIEWBOX);
console.log("");

const transform = computeAffineTransform(CONTROL_POINTS);

// Test QVB (using corrected coordinates from businesses.ts)
const QVB = { lat: -33.8718, lng: 151.2067 };  // ✅ CORRECTED: From businesses.ts
const qvbSvg = latLngToSvgUsingTransform(QVB.lat, QVB.lng, transform);
const qvbInBounds = qvbSvg.x >= 0 && qvbSvg.x <= VIEWBOX.width && qvbSvg.y >= 0 && qvbSvg.y <= VIEWBOX.height;

console.log("🏛️ QVB (Database - Corrected):");
console.log(`  GPS: (${QVB.lat}, ${QVB.lng})`);
console.log(`  SVG: (${qvbSvg.x.toFixed(2)}, ${qvbSvg.y.toFixed(2)})`);
console.log(`  Expected SVG: (335.16, 943.02) [Calculated from other control points]`);
console.log(`  Status: ${qvbInBounds ? '✅ VISIBLE ON MAP' : '❌ OUTSIDE VIEWBOX'}`);
console.log("");

// Test user's actual location
const USER_ACTUAL = { lat: -33.897054, lng: 151.184157 };
const userSvg = latLngToSvgUsingTransform(USER_ACTUAL.lat, USER_ACTUAL.lng, transform);
const userInBounds = userSvg.x >= 0 && userSvg.x <= VIEWBOX.width && userSvg.y >= 0 && userSvg.y <= VIEWBOX.height;

console.log("👤 User's Actual Location:");
console.log(`  GPS: (${USER_ACTUAL.lat}, ${USER_ACTUAL.lng})`);
console.log(`  SVG: (${userSvg.x.toFixed(2)}, ${userSvg.y.toFixed(2)})`);
console.log(`  Status: ${userInBounds ? '✅ VISIBLE ON MAP' : '❌ OUTSIDE VIEWBOX'}`);
if (!userInBounds) {
  console.log(`  Note: You are ~${Math.abs(userSvg.x - VIEWBOX.width/2).toFixed(0)}m ${userSvg.x < 0 ? 'WEST' : 'EAST'} and ~${Math.abs(userSvg.y - VIEWBOX.height/2).toFixed(0)}m ${userSvg.y < 0 ? 'NORTH' : 'SOUTH'} of map center`);
}
console.log("");

// Test a few database businesses
const BUSINESSES = [
  { name: "Market City Food Court", lat: -33.8788, lng: 151.2045 },
  { name: "Chat Thai", lat: -33.8785, lng: 151.2048 },
  { name: "Golden Century", lat: -33.8795, lng: 151.205 },
];

console.log("🏪 Sample Database Businesses:");
for (const biz of BUSINESSES) {
  const svg = latLngToSvgUsingTransform(biz.lat, biz.lng, transform);
  const inBounds = svg.x >= 0 && svg.x <= VIEWBOX.width && svg.y >= 0 && svg.y <= VIEWBOX.height;
  console.log(`  ${biz.name}: (${svg.x.toFixed(2)}, ${svg.y.toFixed(2)}) ${inBounds ? '✅' : '❌'}`);
}

console.log("\n=== SUMMARY ===");
if (qvbInBounds) {
  console.log("✅ QVB marker should be visible on map");
  console.log(`   at position (${qvbSvg.x.toFixed(0)}, ${qvbSvg.y.toFixed(0)})`);
} else {
  console.log("❌ QVB marker will NOT be visible");
}

if (!userInBounds) {
  console.log("⚠️  Your actual GPS location is OUTSIDE the map bounds");
  console.log("   This is why you see 'You are outside this map area'");
}
