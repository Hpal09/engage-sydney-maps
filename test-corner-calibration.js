/**
 * Test the 4-corner calibration approach
 */

const viewBox = { width: 726.77, height: 1643.6 };

const corners = [
  { gps: { lat: -33.85915499, lng: 151.19767695 }, svg: { x: 0, y: 0 } },           // Northwest
  { gps: { lat: -33.85915499, lng: 151.23189309 }, svg: { x: viewBox.width, y: 0 } },  // Northeast
  { gps: { lat: -33.90132204, lng: 151.23189309 }, svg: { x: viewBox.width, y: viewBox.height } },  // Southeast
  { gps: { lat: -33.90132204, lng: 151.19767695 }, svg: { x: 0, y: viewBox.height } },  // Southwest
];

// Simple bilinear interpolation (fallback approach)
function gpsToSvgSimple(lat, lng) {
  const latRange = corners[2].gps.lat - corners[0].gps.lat;  // South - North
  const lngRange = corners[1].gps.lng - corners[0].gps.lng;  // East - West

  const xRatio = (lng - corners[0].gps.lng) / lngRange;
  const yRatio = (lat - corners[0].gps.lat) / latRange;

  const x = xRatio * viewBox.width;
  const y = yRatio * viewBox.height;

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

console.log("=== TESTING WITH 4-CORNER CALIBRATION ===\n");
console.log("ViewBox: 0 0 726.77 1643.6\n");
console.log("Map Coverage:");
console.log("  North: -33.85915° (Observatory area)");
console.log("  South: -33.90132° (Central Station area)");
console.log("  West:  151.19768° (Darling Harbour)");
console.log("  East:  151.23189° (Kings Cross)\n");

businesses.forEach(b => {
  const svg = gpsToSvgSimple(b.lat, b.lng);
  const withinBounds = svg.x >= 0 && svg.x <= viewBox.width && svg.y >= 0 && svg.y <= viewBox.height;
  const status = withinBounds ? "✅ VISIBLE" : "❌ OFF-SCREEN";

  console.log(`${b.name}:`);
  console.log(`  GPS: (${b.lat}, ${b.lng})`);
  console.log(`  SVG: (${svg.x.toFixed(2)}, ${svg.y.toFixed(2)})`);
  console.log(`  Status: ${status}`);
  console.log("");
});
