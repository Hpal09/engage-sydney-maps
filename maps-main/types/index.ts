export interface Business {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  address?: string;
  priceRange?: '$' | '$$' | '$$$' | '$$$$';
  description?: string;
  hours?: string;
  phone?: string;
  website?: string;
  rating?: number;
  imageUrl?: string;
  tags?: string[];
  hasIndoorMap?: boolean; // Indicates if this place has indoor navigation
}

export interface SearchResult {
  response: string;
  businessIds: string[];
  businesses: Business[];
  followupQuestions?: string[];
  categories?: string[];
  priceRange?: '$' | '$$' | '$$$' | '$$$$' | null;
  intent?: string;
}

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  maneuver: string;
}

export interface DeviceLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number | null;
  speed?: number | null;
  timestamp?: number;
}

// Wayfinding / Navigation types
export interface Intersection {
  id: string;
  name: string;
  x: number; // SVG coordinate
  y: number; // SVG coordinate
  lat?: number;
  lng?: number;
}

export interface PathNode {
  id: string;
  x: number; // SVG coordinate
  y: number; // SVG coordinate
  lat?: number;
  lng?: number;
  street?: string; // Street name for this node
}

export interface PathEdge {
  from: string;
  to: string;
  distance: number; // in SVG units
  points?: Array<{ x: number; y: number }>; // Intermediate points for curved segments
  street?: string; // Street name for this edge
}

export interface PreDefinedRoute {
  fromId: string;
  toId: string;
  path: Array<{ x: number; y: number }>;
  streets: string[];
}

export interface PathGraph {
  nodesById: Record<string, PathNode>;
  adjacency: Record<string, Array<{ to: string; distance: number; points?: Array<{ x: number; y: number }>; street?: string }>>;
  predefinedRoutes?: PreDefinedRoute[];
}

/**
 * PHASE 2: Spatial Index - Node bounds for quadtree
 * Used to efficiently find nearest nodes using spatial indexing
 * Custom data type for quadtree Rectangle objects
 */
export interface NodeBoundsData {
  nodeId: string; // Reference to the node
}

export interface RouteSummary {
  distanceMeters: number;
  durationMinutes: number;
}

/**
 * Zoom Configuration - Controls zoom levels for different map states
 *
 * All zoom decisions live here for easy dashboard configuration.
 */
export interface ZoomConfig {
  initial: number;        // 1) App start - initial map view
  placeStart: number;     // 2) When a place is set as starting point
  destination: number;    // 3) When destination is set / centered
  navigation: number;     // 4) When navigation starts / follow mode
  navigationStart: number; // 5) When turn-by-turn navigation starts (with rotation)
}

