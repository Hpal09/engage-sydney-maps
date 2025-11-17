/**
 * Centralized Map Configuration
 *
 * This file contains all map-related constants, control points, and configuration
 * to ensure consistency across the entire application.
 */

export interface ControlPoint {
  name: string;
  svgX: number;
  svgY: number;
  lat: number;
  lng: number;
}

/**
 * SVG ViewBox dimensions
 * Matches the actual SVG file: viewBox="0 0 726.77 1643.6"
 */
export const VIEWBOX = Object.freeze({
  width: 726.77,
  height: 1643.6,
  minX: 0,
  minY: 0,
});

/**
 * Map Control Points for Coordinate Calibration
 *
 * These points were carefully measured from the actual SVG map file
 * by identifying known landmarks and their corresponding GPS coordinates.
 *
 * Used for affine transformation: GPS (lat, lng) ↔ SVG (x, y)
 */
export const CONTROL_POINTS: ReadonlyArray<ControlPoint> = Object.freeze([
  {
    name: 'observatory_building',
    svgX: 262.96,
    svgY: 343.01,
    lat: -33.85972,
    lng: 151.20472,
  },
  {
    name: 'qvb_center',
    svgX: 335.16,       // Calculated from other control points (consistent with map coordinate system)
    svgY: 943.02,       // GPS: -33.8718, 151.2067 from businesses.ts
    lat: -33.8718,      // From businesses.ts - authoritative GPS source
    lng: 151.2067,      // From businesses.ts - authoritative GPS source
  },
  {
    name: 'tumbalong_park_central_lawn',
    svgX: 134.21,
    svgY: 1137.16,
    lat: -33.8757,
    lng: 151.20172,
  },
  {
    name: 'capitol_theatre_roof',
    svgX: 328.31,
    svgY: 1337.15,
    lat: -33.8797,
    lng: 151.2067,
  },
  {
    name: 'the_exchange_darling_square',
    svgX: 152.81,
    svgY: 1248.46,
    lat: -33.87791401631311,
    lng: 151.2022219730791,
  },
  {
    name: 'terminal_roof',
    svgX: 481.26,
    svgY: 251.31,
    lat: -33.85794,
    lng: 151.21008,
  },
]);

/**
 * GPS Corner Coordinates - Fallback mapping boundaries
 *
 * These define the geographic area covered by the map SVG.
 * Used as fallback when calibrated transformation is not available.
 */
export const GPS_CORNERS = Object.freeze({
  topLeft: { lat: -33.85721, lng: 151.20121 },      // Barangaroo / The Rocks NW tip
  topRight: { lat: -33.85794, lng: 151.21008 },     // Overseas Passenger Terminal
  bottomRight: { lat: -33.88317, lng: 151.20695 },  // Haymarket / Central
  bottomLeft: { lat: -33.8757, lng: 151.20172 },    // Darling Square / Tumbalong Park
});

/**
 * Expanded bounding box for wider Sydney area coverage
 */
export const SYD_CBD_BBOX = Object.freeze({
  latMin: -33.90,     // Expanded south
  latMax: -33.855,    // Expanded north
  lngMin: 151.18,     // Expanded west
  lngMax: 151.215,    // Expanded east
});

/**
 * Map UI Constants
 */
export const MAP_CONSTANTS = Object.freeze({
  // Initial zoom multiplier after fitting content
  INITIAL_ZOOM_MULTIPLIER: 2.5,

  // Zoom limits
  MIN_SCALE: 1,
  MAX_SCALE: 8,

  // Zoom controls
  WHEEL_STEP: 0.15,
  WHEEL_SMOOTH_STEP: 0.01,
  DOUBLE_CLICK_ZOOM_STEP: 0.5,

  // Animation
  VELOCITY_SENSITIVITY: 1,
  VELOCITY_ANIMATION_TIME: 400,

  // SVG coordinate for initial center point (MAP_PIN_SVG_COORD)
  INITIAL_CENTER: Object.freeze({ x: 337.12, y: 984.08 }),
});

/**
 * Coordinate normalization limits
 */
export const COORDINATE_LIMITS = Object.freeze({
  MAX_LAT_ABS: 90,
  MAX_LNG_ABS: 180,
  HUGE_COORD_THRESHOLD_MULTIPLIER: 1000,
  MAX_COORD_DIVIDE_ITERATIONS: 20,
});
