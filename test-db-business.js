/**
 * Test where database businesses would appear with the new calibration
 */

// Simulate the affine transformation from coordinateMapper.ts
const calibrationPoints = [
  { gps: { lat: -33.86980521107316, lng: 151.20930207603297 }, svg: { x: 726.77, y: 709.6473 } },      // Sydney Tower Eye
  { gps: { lat: -33.85934215409333, lng: 151.20482974792455 }, svg: { x: 407.8951, y: 0.0 } },         // Sydney Observatory
  { gps: { lat: -33.8793433397255, lng: 151.20584716367048 }, svg: { x: 472.0502, y: 1352.3999 } },    // Haymarket Capital Square
  { gps: { lat: -33.876359292831864, lng: 151.20280561297912 }, svg: { x: 219.7793, y: 1146.411 } },   // Chinese Garden
  { gps: { lat: -33.8748045077514, lng: 151.19951213720176 }, svg: { x: 0.0, y: 1077.5208 } },         // ICC Sydney
  { gps: { lat: -33.88243350394275, lng: 151.20154831283497 }, svg: { x: 158.8336, y: 1562.5103 } },   // ABC Studios
  { gps: { lat: -33.882599232720864, lng: 151.20649771960913 }, svg: { x: 506.6314, y: 1643.6 } },     // Central Station
  { gps: { lat: -33.881628, lng: 151.204532 }, svg: { x: 356.0375, y: 1464.2406 } },                   // User's verified location
];

// Simple affine transformation (copied from coordinateMapper.ts logic)
function solveAffine(lngs, lats, xs, ys) {
  const n = lngs.length;
  let sLL = 0, sLa = 0, s1 = n;
  let sL = 0, sA = 0, sXL = 0, sXA = 0, sX = 0, sYL = 0, sYA = 0, sY = 0, sLA = 0;

  for (let k = 0; k < n; k++) {
    const L = lngs[k];
    const A = lats[k];
    const X = xs[k];
    const Y = ys[k];
    sL += L; sA += A; sLL += L * L; sLa += A * A; sLA += L * A;
    sXL += X * L; sXA += X * A; sX += X; sYL += Y * L; sYA += Y * A; sY += Y;
  }

  const M = [sLL, sLA, sL, sLA, sLa, sA, sL, sA, s1];

  // Simplified matrix inversion
  const det = M[0] * (M[4] * M[8] - M[7] * M[5]) -
              M[1] * (M[3] * M[8] - M[6] * M[5]) +
              M[2] * (M[3] * M[7] - M[6] * M[4]);

  if (Math.abs(det) < 1e-12) return null;

  // Solve for x and y coefficients
  const bx = [sXL, sXA, sX];
  const by = [sYL, sYA, sY];

  // Matrix inverse calculation (simplified)
  const invDet = 1 / det;
  const Minv = [
    (M[4] * M[8] - M[7] * M[5]) * invDet,
    -(M[1] * M[8] - M[7] * M[2]) * invDet,
    (M[1] * M[5] - M[4] * M[2]) * invDet,
    -(M[3] * M[8] - M[6] * M[5]) * invDet,
    (M[0] * M[8] - M[6] * M[2]) * invDet,
    -(M[0] * M[5] - M[3] * M[2]) * invDet,
    (M[3] * M[7] - M[6] * M[4]) * invDet,
    -(M[0] * M[7] - M[6] * M[1]) * invDet,
    (M[0] * M[4] - M[3] * M[1]) * invDet,
  ];

  const ax = [
    Minv[0] * bx[0] + Minv[1] * bx[1] + Minv[2] * bx[2],
    Minv[3] * bx[0] + Minv[4] * bx[1] + Minv[5] * bx[2],
    Minv[6] * bx[0] + Minv[7] * bx[1] + Minv[8] * bx[2],
  ];

  const ay = [
    Minv[0] * by[0] + Minv[1] * by[1] + Minv[2] * by[2],
    Minv[3] * by[0] + Minv[4] * by[1] + Minv[5] * by[2],
    Minv[6] * by[0] + Minv[7] * by[1] + Minv[8] * by[2],
  ];

  return { ax, ay };
}

const lngs = calibrationPoints.map(p => p.gps.lng);
const lats = calibrationPoints.map(p => p.gps.lat);
const xs = calibrationPoints.map(p => p.svg.x);
const ys = calibrationPoints.map(p => p.svg.y);

const affine = solveAffine(lngs, lats, xs, ys);

function gpsToSvg(lat, lng) {
  const x = affine.ax[0] * lng + affine.ax[1] * lat + affine.ax[2];
  const y = affine.ay[0] * lng + affine.ay[1] * lat + affine.ay[2];
  return { x, y };
}

// Test database businesses
const businesses = [
  { name: "QVB", lat: -33.8718, lng: 151.2067 },
  { name: "Market City Food Court", lat: -33.8788, lng: 151.2045 },
  { name: "Chat Thai", lat: -33.8785, lng: 151.2048 },
  { name: "Golden Century", lat: -33.8795, lng: 151.205 },
  { name: "Gumshara Ramen", lat: -33.879, lng: 151.2049 },
  { name: "Mamak", lat: -33.8792, lng: 151.2052 },
];

console.log("=== TESTING DATABASE BUSINESSES ===\n");
console.log("ViewBox: 0 0 726.77 1643.6\n");

businesses.forEach(b => {
  const svg = gpsToSvg(b.lat, b.lng);
  const withinBounds = svg.x >= 0 && svg.x <= 726.77 && svg.y >= 0 && svg.y <= 1643.6;
  const status = withinBounds ? "✅ VISIBLE" : "❌ OFF-SCREEN";

  console.log(`${b.name}:`);
  console.log(`  GPS: (${b.lat}, ${b.lng})`);
  console.log(`  SVG: (${svg.x.toFixed(2)}, ${svg.y.toFixed(2)})`);
  console.log(`  Status: ${status}`);
  console.log("");
});

console.log("\n=== DIAGNOSIS ===");
console.log("If all businesses show ✅ VISIBLE, the calibration is working.");
console.log("If they show ❌ OFF-SCREEN, the calibration needs adjustment.");
