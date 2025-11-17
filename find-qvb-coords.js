/**
 * Find the best QVB SVG coordinates based on other control points
 * This will calculate where QVB should be positioned based on the existing affine transform
 */

const CONTROL_POINTS_WITHOUT_QVB = [
  { name: 'observatory_building', svgX: 262.96, svgY: 343.01, lat: -33.85972, lng: 151.20472 },
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

console.log("=== Finding QVB SVG Coordinates ===\n");
console.log("Computing transform from other 5 control points (excluding QVB)...\n");

const transform = computeAffineTransform(CONTROL_POINTS_WITHOUT_QVB);

// QVB GPS coordinates (from businesses.ts - authoritative)
const QVB_GPS = { lat: -33.8718, lng: 151.2067 };

// Calculate where QVB should be in SVG coordinates
const qvbCalculated = latLngToSvgUsingTransform(QVB_GPS.lat, QVB_GPS.lng, transform);

console.log("QVB GPS (from businesses.ts):", QVB_GPS);
console.log("QVB SVG (calculated from other control points):", qvbCalculated);
console.log("");
console.log("✅ RECOMMENDED: Use these SVG coordinates for QVB:");
console.log(`   svgX: ${qvbCalculated.x.toFixed(2)}`);
console.log(`   svgY: ${qvbCalculated.y.toFixed(2)}`);
console.log("");
console.log("Note: The value from svgBuildings.json (176.3, 472.265) appears to be");
console.log("in a different coordinate system and is NOT compatible with the");
console.log("other control points.");
