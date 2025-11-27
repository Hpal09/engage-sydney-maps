/**
 * Map Calibration Utility
 * 
 * This script helps calibrate GPS coordinates to SVG coordinates for the Sydney map.
 * Since the SVG is traced from Google Maps, you need to identify known landmarks
 * and their positions in both GPS and SVG coordinate systems.
 * 
 * Usage:
 * 1. Identify landmarks on your SVG (e.g., QVB, Town Hall, Circular Quay)
 * 2. Find their GPS coordinates (from Google Maps or your business data)
 * 3. Find their SVG pixel coordinates (by inspecting the SVG or clicking on the map)
 * 4. Add calibration points below
 * 5. Run: ts-node scripts/calibrateMap.ts
 * 
 * The output will show:
 * - Computed GPS corners for the SVG
 * - Calibration accuracy metrics
 * - Recommended GPS_CORNERS values to use
 */

import { setCalibration } from '../lib/coordinateMapper';
import type { GpsCoordinate, SvgCoordinate } from '../lib/coordinateMapper';

// CALIBRATION POINTS
// Add known GPS-SVG coordinate pairs here
// Format: { name: "Landmark Name", gps: { lat, lng }, svg: { x, y } }
// 
// To find SVG coordinates:
// 1. Open the SVG in a viewer/editor
// 2. Hover over or click on the landmark location
// 3. Note the x,y coordinates (these are in SVG viewBox coordinate space)
//
// Example for QVB (you'll need to find the actual SVG coordinates):
const CALIBRATION_POINTS: Array<{ name: string; gps: GpsCoordinate; svg: SvgCoordinate }> = [
  // Example: QVB
  // { name: "QVB", gps: { lat: -33.8718, lng: 151.2067 }, svg: { x: 3500, y: 8200 } },
  
  // Add more landmarks here:
  // - Town Hall Station
  // - Circular Quay
  // - Sydney Opera House
  // - Central Station
  // etc.
];

// GPS coordinates for known landmarks (from businesses.ts or Google Maps)
const KNOWN_LANDMARKS: Record<string, GpsCoordinate> = {
  qvb: { lat: -33.8718, lng: 151.2067 },
  townHall: { lat: -33.8727, lng: 151.2064 },
  circularQuay: { lat: -33.8615, lng: 151.2110 },
  central: { lat: -33.8832, lng: 151.2067 },
  // Add more as needed
};

function calibrate() {
  if (CALIBRATION_POINTS.length < 3) {
    console.error('❌ Error: Need at least 3 calibration points');
    console.log('\n📋 To calibrate:');
    console.log('1. Open the SVG file and identify known landmarks');
    console.log('2. Find their GPS coordinates (use KNOWN_LANDMARKS above or Google Maps)');
    console.log('3. Find their SVG pixel coordinates (inspect SVG or use map click)');
    console.log('4. Add calibration points to CALIBRATION_POINTS array');
    console.log('5. Run this script again');
    return;
  }

  console.log(`\n✅ Calibrating with ${CALIBRATION_POINTS.length} points...\n`);

  // Set calibration
  setCalibration(CALIBRATION_POINTS);

  // Calculate estimated corners
  const svgWidth = 9957.04;
  const svgHeight = 15891.1;

  // Convert SVG corners to GPS to show recommended values
  const { svgToGps } = require('../lib/coordinateMapper');
  const topLeft = svgToGps(0, 0);
  const topRight = svgToGps(svgWidth, 0);
  const bottomRight = svgToGps(svgWidth, svgHeight);
  const bottomLeft = svgToGps(0, svgHeight);

  console.log('📍 Recommended GPS_CORNERS values:\n');
  console.log('const GPS_CORNERS = {');
  console.log(`  topLeft: { lat: ${topLeft.lat}, lng: ${topLeft.lng } }, // SVG (0, 0)`);
  console.log(`  topRight: { lat: ${topRight.lat}, lng: ${topRight.lng} }, // SVG (${svgWidth}, 0)`);
  console.log(`  bottomRight: { lat: ${bottomRight.lat}, lng: ${bottomRight.lng} }, // SVG (${svgWidth}, ${svgHeight})`);
  console.log(`  bottomLeft: { lat: ${bottomLeft.lat}, lng: ${bottomLeft.lng} }, // SVG (0, ${svgHeight})`);
  console.log('};\n');

  // !== Error check: Test reverse conversion
  console.log('🔍 Testing calibration accuracy:\n');
  let maxError = 0;
  for (const point of CALIBRATION_POINTS) {
    const { gpsToSvg, svgToGps: stg } = require('../lib/coordinateMapper');
    const convertedSvg = gpsToSvg(point.gps.lat, point.gps.lng);
    const convertedGps = stg(point.svg.x, point.svg.y);
    
    const svgError = Math.hypot(convertedSvg.x - point.svg.x, convertedSvg.y - point.svg.y);
    const gpsError = Math.hypot(
      (convertedGps.lat - point.gps.lat) * 111000, // Approx meters
      (convertedGps.lng - point.gps.lng) * 111000 * Math.cos(point.gps.lat * Math.PI / 180)
    );
    
    maxError = Math.max(maxError, svgError, gpsError);
    
    console.log(`${point.name}:`);
    console.log(`  SVG error: ${svgError.toFixed(2)} pixels`);
    console.log(`  GPS error: ${gpsError.toFixed(1)} meters`);
  }
  
  console.log(`\n📊 Max error: ${maxError.toFixed(2)} pixels / ${(maxError * 0.1).toFixed(1)} meters (approx)`);
  if (maxError > 50) {
    console.log('⚠️  Warning: High error detected. Consider adding more calibration points.');
  } else {
    console.log('✅ Calibration looks good!');
  }
}

// Run calibration
calibrate();





















