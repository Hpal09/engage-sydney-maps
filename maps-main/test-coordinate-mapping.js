// Test coordinate mapping for QVB
const calibrationPoints = [
  { gps: { lat: -33.85350581, lng: 151.19848430 }, svg: { x: 0, y: 0 } },           // Top-left (north-west)
  { gps: { lat: -33.85350581, lng: 151.21532556 }, svg: { x: 726.77, y: 0 } },     // Top-right (north-east)
  { gps: { lat: -33.88568542, lng: 151.21532556 }, svg: { x: 726.77, y: 1643.6 } },// Bottom-right (south-east)
  { gps: { lat: -33.88568542, lng: 151.19848430 }, svg: { x: 0, y: 1643.6 } },     // Bottom-left (south-west)
];

const SVG_BOUNDS = { width: 726.77, height: 1643.6 };

// QVB coordinates
const QVB = { lat: -33.8718, lng: 151.2067 };

console.log('\n=== CALIBRATION POINTS ===');
console.log('Map bounds (GPS):');
console.log('  North (top):    ', calibrationPoints[0].gps.lat);
console.log('  South (bottom): ', calibrationPoints[2].gps.lat);
console.log('  West (left):    ', calibrationPoints[0].gps.lng);
console.log('  East (right):   ', calibrationPoints[1].gps.lng);
console.log('\nSVG bounds:', SVG_BOUNDS);

console.log('\n=== QVB LOCATION ===');
console.log('QVB GPS:', QVB);

// Check if QVB is within calibration bounds
const withinLatBounds = QVB.lat >= calibrationPoints[2].gps.lat && QVB.lat <= calibrationPoints[0].gps.lat;
const withinLngBounds = QVB.lng >= calibrationPoints[0].gps.lng && QVB.lng <= calibrationPoints[1].gps.lng;

console.log('\nWithin calibrated area?');
console.log('  Latitude:  ', withinLatBounds, `(${calibrationPoints[2].gps.lat} <= ${QVB.lat} <= ${calibrationPoints[0].gps.lat})`);
console.log('  Longitude: ', withinLngBounds, `(${calibrationPoints[0].gps.lng} <= ${QVB.lng} <= ${calibrationPoints[1].gps.lng})`);

// Simple ratio-based mapping (fallback method)
const latRange = calibrationPoints[0].gps.lat - calibrationPoints[2].gps.lat;
const lngRange = calibrationPoints[1].gps.lng - calibrationPoints[0].gps.lng;
const latRatio = (calibrationPoints[0].gps.lat - QVB.lat) / latRange;
const lngRatio = (QVB.lng - calibrationPoints[0].gps.lng) / lngRange;

const svgX = lngRatio * SVG_BOUNDS.width;
const svgY = latRatio * SVG_BOUNDS.height;

console.log('\n=== SIMPLE RATIO MAPPING ===');
console.log('QVB should map to approximately:');
console.log('  SVG X:', svgX.toFixed(2));
console.log('  SVG Y:', svgY.toFixed(2));
console.log('  As percentage of map:');
console.log('    X:', (lngRatio * 100).toFixed(1), '% from left');
console.log('    Y:', (latRatio * 100).toFixed(1), '% from top');

// Check if within SVG bounds
const withinSvgBounds = svgX >= 0 && svgX <= SVG_BOUNDS.width && svgY >= 0 && svgY <= SVG_BOUNDS.height;
console.log('\nWithin SVG bounds?', withinSvgBounds);

console.log('\n=== VISUAL REFERENCE ===');
console.log('SVG canvas is', SVG_BOUNDS.width, 'x', SVG_BOUNDS.height, 'pixels');
console.log('QVB position: ~', Math.round(lngRatio * 100) + '%', 'across,', Math.round(latRatio * 100) + '%', 'down');
