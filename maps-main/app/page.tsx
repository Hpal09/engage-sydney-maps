"use client";



// Extend DeviceOrientationEvent to include iOS-specific compass property

declare global {

  interface DeviceOrientationEvent {

    webkitCompassHeading?: number;

  }

}



import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';

import { throttle } from 'lodash-es';
import { getKalmanFilterManager } from '@/lib/kalmanFilter';
import { useDebounce } from '@/hooks/useDebounce';
import { useFilteredPlaces } from '@/hooks/useFilteredPlaces';

import { X } from 'lucide-react';

import CustomSydneyMap from '@/components/Map/CustomSydneyMap';

// Lazy load heavy components for better initial bundle size
const AISearch = dynamic(() => import('@/components/Search/AISearch'), {
  loading: () => <div className="flex items-center justify-center h-full"><div className="text-gray-500">Loading AI...</div></div>,
  ssr: false,
});

import SearchWidget from '@/components/Search/SearchWidget';

const MapDebugOverlay = dynamic(() => import('@/components/Debug/MapDebugOverlay'), {
  ssr: false,
});

import type { Business, DeviceLocation, Intersection, PathNode, ZoomConfig } from '@/types';

import type { AIEntryContext } from '@/types/ai';

import type { Deal, Event } from '@/lib/dataService';

import { getIntersectionsWithGps } from '@/data/intersections';

import { findAnyRoute, findRoute, findRouteWithDiagnostics, type PathfindingDiagnostics } from '@/lib/pathfinding';
import { findRouteWithWorker } from '@/lib/pathfindingWorkerManager';

import { buildPathNetwork } from '@/lib/graphLoader';
import { gpsToSvg, calculateDistance, isWithinMapBounds, setCalibration, getSvgBounds, normalizeLatitude, normalizeLongitude } from '@/lib/coordinateMapper';

import { getNextInstruction } from '@/lib/turnByTurn';

import NavigationPanel from '@/components/Navigation/NavigationPanel';

// DIAGNOSTIC - TEMPORARY - Remove after testing
import { MemoryProfiler } from '@/components/Debug/MemoryProfiler';

// Lazy load modals - they're only shown conditionally
const LocationDetailModal = dynamic(() => import('@/components/Location/LocationDetailModal'), {
  ssr: false,
});
const IndoorPOIModal = dynamic(() => import('@/components/Location/IndoorPOIModal'), {
  ssr: false,
});

import { findPathBetweenPOIs, findMultiFloorPath } from '@/lib/indoorPathfinding';
import { buildHybridGraph, findHybridRoute } from '@/lib/hybridPathfinding';



// Utility functions moved outside component to avoid recreation on every render

function computeBearingDegrees(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {

  const lat1 = a.lat * Math.PI / 180;

  const lat2 = b.lat * Math.PI / 180;

  const dLng = (b.lng - a.lng) * Math.PI / 180;

  const x = Math.cos(lat2) * Math.sin(dLng);

  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  let brng = Math.atan2(y, x) * 180 / Math.PI;

  brng = (brng + 360) % 360;

  return brng;

}



function normalizeAngle(deg: number): number {

  let d = deg % 360;

  if (d < 0) d += 360;

  return d;

}



function angularLerp(prevDeg: number, nextDeg: number, alpha: number): number {

  const a = normalizeAngle(prevDeg);

  const b = normalizeAngle(nextDeg);

  let delta = b - a;

  if (delta > 180) delta -= 360;

  if (delta < -180) delta += 360;

  return normalizeAngle(a + alpha * delta);

}



/**

 * Determines if heading should be updated based on movement and change magnitude

 * @param speed - Current speed in m/s (from GPS)

 * @param oldHeading - Previous heading in degrees

 * @param newHeading - New heading in degrees

 * @returns true if heading should be updated

 */

function shouldUpdateHeading(

  speed: number | null | undefined,

  oldHeading: number,

  newHeading: number,

  stationaryThreshold: number,

  minChangeWhenStationary: number

): boolean {

  // Always update if moving

  if (speed && speed > stationaryThreshold) return true;



  // Stationary: only update if significant change

  const diff = Math.abs(newHeading - oldHeading);

  const normalizedDiff = diff > 180 ? 360 - diff : diff;

  return normalizedDiff > minChangeWhenStationary;

}



/**

 * Smoothing & Movement Parameters

 *

 * These constants control how GPS position and heading are smoothed to reduce jitter

 * while maintaining responsiveness. Adjust these to tune the map's "feel".

 *

 * Position Smoothing (alpha blending):

 *   - Lower values = more smoothing, less jitter, but slower response

 *   - Higher values = less smoothing, more responsive, but more jitter

 *   - 0.0 = fully smoothed (never moves), 1.0 = no smoothing (instant response)

 *

 * Heading Smoothing (exponential moving average):

 *   - Lower values = more smoothing, smoother rotation

 *   - Higher values = more responsive, quicker rotation updates

 */

const SMOOTHING = {

  // GPS-derived heading smoothing (from speed/movement direction)

  GPS_HEADING_ALPHA: 0.3,           // Moderate smoothing for GPS heading



  // Compass heading smoothing (from device magnetometer)

  COMPASS_HEADING_ALPHA: 0.5,       // More responsive for real-time compass updates



  // Position smoothing when stationary

  POSITION_STATIONARY_ALPHA: 0.4,   // More smoothing to reduce GPS drift when still



  // Position smoothing when walking

  POSITION_WALKING_ALPHA: 0.7,      // Less smoothing to track actual movement



  // Speed thresholds (m/s) for determining movement state

  SPEED_STATIONARY_THRESHOLD: 0.5,  // < 0.5 m/s (~1.8 km/h) = standing still

  SPEED_WALKING_MAX: 2.5,           // < 2.5 m/s (~9 km/h) = walking



  // Compass update throttle (milliseconds)

  COMPASS_UPDATE_INTERVAL: 100,     // Max 10 Hz to reduce jitter



  // Heading change threshold (degrees) for stationary updates

  HEADING_MIN_CHANGE_STATIONARY: 15, // Only update if > 15° change when still

} as const;



const QVB_TELEPORT_COORD = Object.freeze({
  lat: -33.87085879712593,
  lng: 151.20695855393757,
});

const MAP_VERTICAL_SAFE_AREA = Object.freeze({ header: 100, footer: 80 });

function createMockQvbLocation(): DeviceLocation {

  return {

    lat: QVB_TELEPORT_COORD.lat,

    lng: QVB_TELEPORT_COORD.lng,

    accuracy: 3,

    heading: 0,

    speed: 0,

    timestamp: Date.now(),

  };

}



// Import contexts
import { AppProvider } from '@/contexts/AppProvider';
import { useSearch } from '@/contexts/SearchContext';
import { useNavigation } from '@/contexts/NavigationContext';
import { useMap } from '@/contexts/MapContext';
import { useLocation } from '@/contexts/LocationContext';

// Import feature components
import GPSTracker from '@/components/Features/GPSTracker';
import NavigationEngine from '@/components/Features/NavigationEngine';
import IndoorNavigation from '@/components/Features/IndoorNavigation';
import DataLoader from '@/components/Features/DataLoader';

/**
 * Main Page Content - refactored to use contexts
 */
function PageContent() {
  // Access contexts (replaces 48 useState declarations!)
  const search = useSearch();
  const navigation = useNavigation();
  const map = useMap();
  const location = useLocation();

  // Get data from SearchContext (loaded by AppProvider)
  const { allPlaces, allDeals, allEvents, upcomingEventsCount } = search;



  // Navigation state now comes from NavigationContext
  // Map state now comes from MapContext
  // Location state now comes from LocationContext
  // All accessed via: navigation.*, map.*, location.*

  const intersections: Intersection[] = getIntersectionsWithGps();

  // Local state for animation (stays local)
  const [smoothNavMarker, setSmoothNavMarker] = useState<{ x: number; y: number; angleDeg: number } | null>(null);
  const navMarkerRef = useRef<{ x: number; y: number; angleDeg: number } | null>(null);
  
  // Local state for arrival message (stays local)
  const [showArrivalMessage, setShowArrivalMessage] = useState(false);

  const lastShownRef = useRef<{ lat: number; lng: number; timestamp?: number } | null>(null);

  const lastHeadingRef = useRef<number>(0);

  const smoothAlphaRef = useRef<number>(SMOOTHING.GPS_HEADING_ALPHA);

  const lastCompassHeadingRef = useRef<number>(0);

  const lastCompassUpdateRef = useRef<number>(0);

  const compassSmoothAlphaRef = useRef<number>(SMOOTHING.COMPASS_HEADING_ALPHA);

  const compassSetupRef = useRef<(() => void) | null>(null);



  const projectLatLng = useCallback((lat: number, lng: number) => gpsToSvg(lat, lng), []);

  // Filtering is now handled by SearchContext - accessed via search.filteredPlaces
  // (The useFilteredPlaces hook is called inside SearchProvider)

  const handleExitAi = search.handleExitAi; // From SearchContext

  const handleAiSelectPlace = useCallback((placeId: string) => {
    const place = allPlaces.find((p) => p.id === placeId);
    if (!place) {
      console.warn('AI select place not found', placeId);
      return;
    }
    map.setSelected(place);
    map.setShowLocationModal(true);
    map.setCenterOnPoint({ lat: place.lat, lng: place.lng, tick: Date.now(), targetScale: map.zoomConfig?.destination ?? 2.8 });
    handleExitAi();
  }, [allPlaces, handleExitAi, map]);

  const handleAiSelectDeal = useCallback((dealId: string) => {
    const deal = allDeals.find((d) => d.id === dealId);
    if (!deal || !deal.placeId) {
      console.warn('AI select deal missing place', { dealId });
      return;
    }
    handleAiSelectPlace(deal.placeId);
  }, [allDeals, handleAiSelectPlace]);

  const handleAiSelectEvent = useCallback((eventId: string) => {
    const event = allEvents.find((e) => e.id === eventId);
    if (!event || !event.placeId) {
      console.warn('AI select event missing place', { eventId });
      return;
    }
    handleAiSelectPlace(event.placeId);
  }, [allEvents, handleAiSelectPlace]);

  // When selecting a place from the header dropdown, center map on it (with a slight zoom) and highlight it
  const handleSearchSelectPlace = useCallback((placeId: string) => {
    const place = allPlaces.find((p) => p.id === placeId);
    if (!place) {
      console.warn('Search select place not found', placeId);
      return;
    }
    map.setSelected(place);
    map.setCenterOnPoint({
      lat: place.lat,
      lng: place.lng,
      tick: Date.now(),
      targetScale: map.zoomConfig?.destination ?? 2.8,
    });
  }, [allPlaces, map]);

  const handleOpenIndoorMap = useCallback(async (placeId: string) => {
    try {
      const response = await fetch(`/api/indoor-nav/${placeId}`);
      if (!response.ok) {
        console.error('Failed to fetch building data');
        return;
      }
      const data = await response.json();
      navigation.setBuildingData(data.building);
      navigation.setIndoorModeActive(true);
      // Select the first floor (ground floor)
      if (data.building?.floors?.length > 0) {
        navigation.setSelectedFloorId(data.building.floors[0].id);
      }
    } catch (error) {
      console.error('Error opening indoor map:', error);
    }
  }, []);

  const handleExitIndoorMode = useCallback(() => {
    navigation.setIndoorModeActive(false);
    navigation.setSelectedFloorId(null);
    navigation.setBuildingData(null);
    navigation.setSelectedIndoorPOI(null);
  }, [navigation]);

  const handleIndoorPOIClick = useCallback((poi: any) => {
    navigation.setSelectedIndoorPOI(poi);
  }, [navigation]);

  // REMOVED: Indoor SVG loading - now handled by IndoorNavigation component
  // REMOVED: Graph cache clearing - now handled by IndoorNavigation component  
  // REMOVED: Building entrances loading - now handled by IndoorNavigation component
  // REMOVED: Hybrid graph building - now handled by IndoorNavigation component
  // REMOVED: Floor SVG updates - now handled by IndoorNavigation component

  // REMOVED: Hybrid navigation detection - now handled by IndoorNavigation component
  // REMOVED: Indoor route calculation - now handled by IndoorNavigation component
  // REMOVED: Data loading (places, deals, events, zoom config) - now handled by AppProvider
  
  // Handle shared POI link (e.g., ?poi=business-id)
  useEffect(() => {
    if (allPlaces.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const poiId = params.get('poi');

    if (poiId) {
      const poi = allPlaces.find(place => place.id === poiId);
      if (poi) {
        map.setSelected(poi);
        // Clean up URL without reloading page
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [allPlaces, map]);

  // REMOVED: GPS processing (~520 lines) - now handled by GPSTracker component
  // REMOVED: Nav marker calculation - now handled by NavigationEngine component
  // REMOVED: GPS watching useEffect - now handled by GPSTracker component



  // Smooth animation for the nav marker - 60fps interpolation

  useEffect(() => {

    if (!navigation.navMarker) {
      setSmoothNavMarker(null);
      navMarkerRef.current = null;
      return;
    }

    // Sync the ref with the navigation context value
    navMarkerRef.current = navigation.navMarker;

    // Optimized animation - only update when there's significant change
    let animationFrame: number;
    let lastUpdateTime = 0;
    const UPDATE_INTERVAL = parseInt(process.env.NEXT_PUBLIC_ANIMATION_FRAME_INTERVAL || '100', 10); // PHASE 1: Update every 100ms (10fps) for better performance

    const animate = (timestamp: number) => {
      const target = navMarkerRef.current;
      if (!target) return;

      // Throttle updates to reduce re-renders
      if (timestamp - lastUpdateTime < UPDATE_INTERVAL) {
        animationFrame = requestAnimationFrame(animate);
        return;
      }
      lastUpdateTime = timestamp;

      setSmoothNavMarker(prev => {
        if (!prev) return target;

        // Smooth position interpolation
        const smoothFactor = 0.4; // Slightly faster for snappier feel
        const newX = prev.x + (target.x - prev.x) * smoothFactor;
        const newY = prev.y + (target.y - prev.y) * smoothFactor;

        // Skip update if position hasn't changed significantly (PHASE 1: increased threshold)
        const dx = Math.abs(newX - prev.x);
        const dy = Math.abs(newY - prev.y);
        if (dx < 0.5 && dy < 0.5) return prev;

        // Smooth angle interpolation with wrapping
        let angleDiff = target.angleDeg - prev.angleDeg;
        if (angleDiff > 180) angleDiff -= 360;
        if (angleDiff < -180) angleDiff += 360;
        const newAngle = prev.angleDeg + angleDiff * smoothFactor;

        return { x: newX, y: newY, angleDeg: newAngle };
      });

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);



    return () => {

      if (animationFrame) cancelAnimationFrame(animationFrame);

    };

  }, [navigation.navMarker]);



  // Listen to device compass/orientation for arrow rotation

  useEffect(() => {

    console.log('🧭 Setting up compass orientation listener');



    let cleanupFunction: (() => void) | null = null;

    let orientationHandler: ((event: DeviceOrientationEvent) => void) | null = null;



    // Request permission on iOS 13+

    const requestPermission = async () => {

      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {

        try {

          const permission = await (DeviceOrientationEvent as any).requestPermission();

          console.log('🧭 Compass permission:', permission);

          if (permission !== 'granted') {

            console.warn('⚠️ Compass permission denied');

            return false;

          }

          return true;

        } catch (error) {

          console.error('❌ Error requesting compass permission:', error);

          return false;

        }

      }

      return true; // Android or older iOS - no permission needed

    };



    const setupCompass = async () => {

      // Clean up any existing listener first

      if (cleanupFunction) {

        cleanupFunction();

        cleanupFunction = null;

      }



      const permitted = await requestPermission();

      if (!permitted) return;



      const handleOrientation = (event: DeviceOrientationEvent) => {

        // Get compass heading from device

        let rawHeading: number | null = null;



        if (event.webkitCompassHeading !== undefined) {

          // iOS - webkitCompassHeading is in degrees (0-360)

          rawHeading = event.webkitCompassHeading;

        } else if (event.alpha !== null) {

          // Android - alpha is in degrees (0-360)

          // Convert: 0° = North, 90° = East, 180° = South, 270° = West

          rawHeading = 360 - event.alpha;

        }



        if (rawHeading === null) return;



        const now = Date.now();



        // Throttle updates to reduce jitter

        if (now - lastCompassUpdateRef.current < SMOOTHING.COMPASS_UPDATE_INTERVAL) return;



        // ALWAYS UPDATE COMPASS for responsive arrow rotation during navigation

        // The visual jitter is handled by the arrow's CSS transition smoothing

        const currentSmoothed = lastCompassHeadingRef.current || rawHeading;



        // Apply exponential smoothing with wrap-around handling

        const smoothedHeading = angularLerp(currentSmoothed, rawHeading, compassSmoothAlphaRef.current);



        // PERFORMANCE: Disabled frequent compass logging to prevent severe mobile lag

        // This log was firing multiple times per second and causing major performance issues

        // console.log('🧭 Compass heading updated:', {

        //   raw: rawHeading.toFixed(1),

        //   smoothed: smoothedHeading.toFixed(1),

        //   previous: currentSmoothed.toFixed(1),

        //   platform: event.webkitCompassHeading !== undefined ? 'iOS' : 'Android'

        // });



        lastCompassHeadingRef.current = smoothedHeading;

        lastCompassUpdateRef.current = now;

        location.setCompassHeading(smoothedHeading);

      };



      orientationHandler = handleOrientation;

      window.addEventListener('deviceorientation', handleOrientation, true);

      console.log('✅ Compass listener added');



      // Store cleanup function

      cleanupFunction = () => {

        if (orientationHandler) {

          window.removeEventListener('deviceorientation', orientationHandler, true);

          console.log('🛑 Compass listener removed');

        }

      };

    };



    // Store setup function in ref so button can trigger it

    compassSetupRef.current = () => {

      setupCompass();

    };



    // Auto-setup on mount

    setupCompass();



    // Return cleanup function

    return () => {

      if (cleanupFunction) {

        cleanupFunction();

      }

    };

  }, []);



  // Keep instruction updated when user moves or state changes

  useEffect(() => {

    if (!navigation.turnByTurnActive || !navigation.activeRoute) return;

    const here = location.userLocation ? { lat: location.userLocation.lat, lng: location.userLocation.lng } : undefined;

    const graph = (window as any).__SYD_GRAPH__ as import('@/types').PathGraph;
    const msg = getNextInstruction(navigation.activeRoute, here, graph).text;

    navigation.updateInstruction(msg);

  }, [navigation.turnByTurnActive, navigation.activeRoute, location.userLocation, navigation]);

  // Helper function to clear all navigation state

  const clearAllNavigation = () => {

    if (process.env.NODE_ENV !== 'production') {
      console.log('🧹 Clearing all navigation state');
    }

    // Clear navigation context state
    navigation.clearAllNavigation();

    // Clear local component state
    setSmoothNavMarker(null);

    navMarkerRef.current = null;

    // Reset map rotation to north-up
    map.setMapRotation(0);
    if (process.env.NODE_ENV !== 'production') {
      console.log('🧭 Map rotation reset to north-up (0°)');
    }

    // Recenter on current location if available
    if (location.userLocation) {
      map.setCenterOnUserTick((t) => t + 1);
      if (process.env.NODE_ENV !== 'production') {
        console.log('📍 Recentered on user location after clearing navigation');
      }
    }

  };

  /**
   * Mock Arrival Handler - For demo purposes
   * Sets user location to destination and shows arrival message
   */
  const handleMockArrival = (destination: { lat: number; lng: number; label: string }) => {
    console.log('🎯 Mock arrival at:', destination.label);

    // Disable QVB simulation if active (we're now simulating arrival location instead)
    if (location.simulateAtQvb) {
      location.setSimulateAtQvb(false);
      console.log('🔴 Disabled QVB simulation - now using mock arrival location');
    }

    // Set mock arrival location (this prevents GPS from overwriting)
    const arrivedLocation: DeviceLocation = {
      lat: destination.lat,
      lng: destination.lng,
      accuracy: 5,
      heading: 0,
      speed: 0,
      timestamp: Date.now(),
    };
    location.setMockArrivedLocation(arrivedLocation);
    location.setUserLocation(arrivedLocation);

    // Show arrival message
    map.setShowArrivalMessage(true);

    // Clear navigation
    clearAllNavigation();

    // Update navigation start to the new arrival location
    // This ensures "take me there" uses the arrival location as the start point
    const myLocationBusiness: Business = {
      id: 'my-location',
      name: 'My location',
      category: 'Current Position',
      lat: destination.lat,
      lng: destination.lng,
    };
    navigation.setNavigationStart(myLocationBusiness);
    console.log('📍 Updated navigation start to arrival location:', destination.label);

    // Center on new location
    map.setCenterOnPoint({ lat: destination.lat, lng: destination.lng, tick: Date.now(), targetScale: 3.0 });

    // Hide message after 3 seconds
    setTimeout(() => {
      map.setShowArrivalMessage(false);
    }, 3000);
  };

  // Combine GPS heading with compass heading (compass as fallback)

  const effectiveHeading = location.userLocation?.heading ?? location.compassHeading ?? 0;

  // Update map rotation continuously during turn-by-turn navigation
  useEffect(() => {
    if (navigation.turnByTurnActive && effectiveHeading !== null) {
      // Rotate map so heading points upward (Google Maps style)
      map.setMapRotation(effectiveHeading);
      // PERFORMANCE: Disabled logging to prevent lag
      // console.log('🧭 Updating map rotation to heading:', effectiveHeading);
    }
  }, [effectiveHeading, navigation.turnByTurnActive, navigation, map]);



  /**

   * CANONICAL NAVIGATION START HANDLER

   * This function handles route calculation and navigation initialization.

   * Used by both NavigationPanel "Start journey" and "Take me there" button.

   *

   * Accepts Waypoint type (id, label, lat, lng) which is a subset of Business.

   * Options: { startTurnByTurn?: boolean } - defaults to preview-only mode

   */

  const startNavigation = async (
    start: { lat: number; lng: number; id?: string },
    destination: { lat: number; lng: number; id?: string },
    options?: { startTurnByTurn?: boolean }
  ) => {

    // Don't clear mock arrival mode - let it persist during navigation
    // This keeps the user at their mock arrival location when navigating to next destination

    // Ensure graph is loaded

    if (!(window as any).__SYD_GRAPH__) {

      const g = await buildPathNetwork();

      (window as any).__SYD_GRAPH__ = g;

      console.log('Graph loaded:', Object.keys(g.nodesById).length, 'nodes',

        Object.values(g.adjacency).reduce((a, b: any[]) => a + b.length, 0), 'edges');

    }



    // Convert GPS coordinates directly to SVG coordinates for pathfinding

    // This ensures coordinates are in the correct SVG space for findNearestNode()

    const startSvg = projectLatLng(start.lat, start.lng);

    const endSvg = projectLatLng(destination.lat, destination.lng);



    const startInt: Intersection = {

      id: 'nav-start',

      name: 'Start',

      x: startSvg.x,

      y: startSvg.y,

      lat: start.lat,

      lng: start.lng

    };



    const endInt: Intersection = {

      id: 'nav-end',

      name: 'Destination',

      x: endSvg.x,

      y: endSvg.y,

      lat: destination.lat,

      lng: destination.lng

    };



    try {

      const graph = (window as any).__SYD_GRAPH__ as import('@/types').PathGraph;

      // PHASE 3: Use Web Worker for pathfinding to prevent UI freezes
      const useWorker = process.env.NEXT_PUBLIC_USE_WEB_WORKERS !== 'false';

      // Find route using worker (with automatic fallback to main thread)
      const result = await findRouteWithWorker(
        graph,
        startInt,
        endInt,
        start.id,
        destination.id,
        useWorker
      );

      // Create diagnostics object for debug overlay
      const diagnostics: PathfindingDiagnostics = {
        route: result.route,
        startNode: result.route[0] || null,
        endNode: result.route[result.route.length - 1] || null,
        startDistance: 0,
        endDistance: 0,
        algorithm: result.algorithm
      };

      navigation.setPathfindingDiag(diagnostics);  // Store for debug overlay



      if (diagnostics.route.length >= 2) {

        const route = diagnostics.route;

        navigation.setActiveRoute(route);

        // Note: remainingRoute and routeProgress are managed by the navigation reducer

        navigation.setNavigationActive(true);

        navigation.setShowNavigationError(false);



        // Position arrow at starting point

        const startPoint = route[0];

        const nextPoint = route[1];

        const dx = nextPoint.x - startPoint.x;

        const dy = nextPoint.y - startPoint.y;

        const angleRad = Math.atan2(dy, dx);

        const angleDeg = (angleRad * 180) / Math.PI;



        const initialMarker = { x: startPoint.x, y: startPoint.y, angleDeg };

        // Note: navMarker is managed by the NavigationEngine component

        navMarkerRef.current = initialMarker;

        setSmoothNavMarker(initialMarker);



        console.log('🎯 Arrow positioned at start:', { x: startPoint.x, y: startPoint.y, angle: angleDeg });



        // Handle turn-by-turn activation if requested
        if (options?.startTurnByTurn) {
          navigation.setTurnByTurnActive(true);
          const graph = (window as any).__SYD_GRAPH__ as import('@/types').PathGraph;
          const msg = getNextInstruction(route, location.userLocation ? { lat: location.userLocation.lat, lng: location.userLocation.lng } : undefined, graph).text;
          navigation.updateInstruction(msg);
          // Set initial map rotation to current heading (Google Maps style)
          const heading = location.userLocation?.heading ?? location.compassHeading ?? 0;
          map.setMapRotation(heading);
          // Recenter on user to start turn-by-turn experience with configured zoom
          if (location.userLocation) {
            map.setCenterOnPoint({ lat: location.userLocation.lat, lng: location.userLocation.lng, tick: Date.now(), targetScale: map.zoomConfig?.navigationStart ?? 3.5 });
          }
          console.log('🎯 Turn-by-turn navigation activated with rotation:', heading);
        }
        // Preview mode: Just draw the route, no camera movement



        return;

      }

    } catch (error) {

      console.error('❌ Pathfinding error:', error);

    }



    // NO FALLBACK - Show error to user instead of drawing straight line

    console.error('❌ No walkable route found between selected locations');

    navigation.setNavigationErrorMessage(

      'Unable to find a walkable route between these locations. ' +

      'This could mean:\n\n' +

      '• One or both locations are outside the walkable street network\n' +

      '• The locations are in disconnected areas of the map\n' +

      '• The navigation graph needs to be rebuilt\n\n' +

      'Please try selecting different locations that are on streets or walkways.'

    );

    navigation.setShowNavigationError(true);

    navigation.setNavigationActive(false);

    navigation.setActiveRoute(null);

  };



  /**

   * "TAKE ME THERE" HANDLER

   * Shortcut to start navigation from current user location to a business.

   */

  const handleTakeMeThere = (business: Business) => {

    // Clean the business object

    const cleanBusiness: Business = {

      id: business.id,

      name: business.name,

      category: business.category,

      lat: business.lat,

      lng: business.lng,

      address: business.address,

      priceRange: business.priceRange,

      description: business.description,

      hours: business.hours,

      phone: business.phone,

      rating: business.rating,

    };



    // Set destination

    navigation.setNavigationDestination(cleanBusiness);



    if (location.userLocation) {

      // Create a pseudo-Business from user location
      // IMPORTANT: Use 'my-location' to match NavigationPanel's options id

      const userLocationBusiness: Business = {

        id: 'my-location',

        name: 'My location',

        category: 'Current Position',

        lat: location.userLocation.lat,

        lng: location.userLocation.lng,

      };



      // Set start

      navigation.setNavigationStart(userLocationBusiness);



      // Close modal

      map.setShowLocationModal(false);

      map.setSelected(null);



      // Start navigation

      startNavigation(userLocationBusiness, cleanBusiness);

    } else {

      // No user location - just set destination and close modal

      // User can select start manually from NavigationPanel

      console.warn("No userLocation available – please select a starting point or enable location.");

      map.setShowLocationModal(false);

      map.setSelected(null);

    }

  };


  const handleAiNavigation = useCallback((destType: 'place' | 'deal' | 'event', destId: string) => {
    let place: Business | undefined;
    if (destType === 'place') {
      place = allPlaces.find((p) => p.id === destId);
    } else if (destType === 'deal') {
      const deal = allDeals.find((d) => d.id === destId);
      if (deal?.placeId) {
        place = allPlaces.find((p) => p.id === deal.placeId);
      }
    } else if (destType === 'event') {
      const event = allEvents.find((e) => e.id === destId);
      if (event?.placeId) {
        place = allPlaces.find((p) => p.id === event.placeId);
      }
    }

    if (!place) {
      console.warn('AI navigation target not found', { destType, destId });
      return;
    }

    handleExitAi();
    map.setCenterOnPoint({ lat: place.lat, lng: place.lng, tick: Date.now(), targetScale: map.zoomConfig?.destination ?? 2.8 });
    handleTakeMeThere(place);
  }, [allPlaces, allDeals, allEvents, handleExitAi, handleTakeMeThere, map]);


  // Debug: Log what we're passing to the map (DISABLED for performance)
  // PERFORMANCE: This was causing severe lag by logging on every GPS update
  // useEffect(() => {
  //   console.log('🗺️ Map props:', {
  //     hasActiveRoute: !!navigation.activeRoute,
  //     activeRouteLength: navigation.activeRoute?.length,
  //     hasSmoothNavMarker: !!smoothNavMarker,
  //     smoothNavMarker: smoothNavMarker,
  //     turnByTurnActive: navigation.turnByTurnActive,
  //     hasUserLocation: !!location.userLocation,
  //     gpsHeading: location.userLocation?.heading,
  //     compassHeading: location.compassHeading,
  //     effectiveHeading: effectiveHeading
  //   });
  // }, [navigation.activeRoute, smoothNavMarker, navigation.turnByTurnActive, location.userLocation, location.compassHeading, effectiveHeading, navigation, location]);

  // Memoize business click handler to prevent unnecessary re-renders and event listener churn
  const handleBusinessClick = useCallback((business: Business) => {
    map.setSelected(business);
    map.setShowLocationModal(true);
  }, [map]);

  return (

    <>
      {/* DIAGNOSTIC - TEMPORARY - Remove after testing */}
      <MemoryProfiler />

      {/* LAYER 1: Full-screen map background */}

      <div className="fixed inset-0 z-0">

        <CustomSydneyMap
          businesses={search.filteredPlaces}
          selectedBusiness={map.selected}
          userLocation={location.userLocation ? { ...location.userLocation, heading: effectiveHeading } : undefined}
          onBusinessClick={handleBusinessClick}
          activeRoute={navigation.remainingRoute || navigation.activeRoute}

          onCenterOnUser={Boolean(map.centerOnUserTick)}

          onCenterOnPoint={map.centerOnPoint}

          smoothNavMarker={navigation.turnByTurnActive ? smoothNavMarker : null}

          navigationStart={navigation.navigationStart}
          navigationDestination={navigation.navigationDestination}
          showGraphOverlay={map.showGraphOverlay}
          debugTransformLogTick={map.debugTransformLogTick}
          zoomConfig={map.zoomConfig || undefined}
          mapRotation={map.mapRotation}
          turnByTurnActive={navigation.turnByTurnActive}
          showPOIMarkers={search.activeTabs.size > 0}
          indoorModeActive={navigation.indoorModeActive}
          buildingData={navigation.buildingData}
          selectedFloorId={navigation.selectedFloorId}
          onExitIndoorMode={handleExitIndoorMode}
          onFloorChange={navigation.setSelectedFloorId}
          onIndoorPOIClick={handleIndoorPOIClick}
          indoorNavigationStart={navigation.indoorNavigationStart}
          indoorNavigationDestination={navigation.indoorNavigationDestination}
          indoorRoute={navigation.indoorRoute}
        />
      </div>



      {/* LAYER 2: UI elements floating on top */}

      <div className="fixed inset-0 z-10 pointer-events-none">

        {/* Utility buttons - positioned on the right side below map controls */}

        <div className="absolute right-4 top-[300px] z-20 flex flex-col gap-2 pointer-events-auto">

          <button

            className={`rounded px-3 py-2 text-xs shadow ${search.nearMeOnly ? 'bg-blue-600 text-white border-blue-700' : 'bg-white/90 hover:bg-white'}`}

            onClick={() => {

              if (!search.nearMeOnly && !location.userLocation) {

                alert('⚠️ Location not available. Please enable GPS.');

                return;

              }

              search.setNearMeOnly(!search.nearMeOnly);

            }}

          >

            {search.nearMeOnly ? '📍 Near Me' : '📍 Near Me'}

          </button>

          <button

            className="rounded bg-white/90 px-3 py-2 text-xs shadow hover:bg-white"

            onClick={async () => {

              // Trigger compass setup (will request permission if needed)

              if (compassSetupRef.current) {

                compassSetupRef.current();

                alert('🧭 Compass enabled! Rotate your device to see the navigation arrow rotate.');

              } else {

                console.error('❌ Compass setup function not available');

              }

            }}

          >

            🧭 Compass

          </button>

          <button

            className={`rounded px-3 py-2 text-xs shadow ${location.simulateAtQvb ? 'bg-green-600 text-white border-green-700' : 'bg-white/90 hover:bg-white'}`}

            onClick={() => {

                console.log('[TeleportQVB] button clicked', { simulateAtQvb: location.simulateAtQvb });

                map.setDebugTransformLogTick(Date.now());

                if (!location.simulateAtQvb) {

                  // Clear mock arrival mode when teleporting
                  location.setMockArrivedLocation(null);

                  // Find QVB by name or use fallback coordinates

                  const qvbFromDb = allPlaces.find((b) =>

                    b.name.toLowerCase().includes('queen victoria') ||

                    b.name.toLowerCase().includes('qvb')

                  );



                  const qvbCoords = qvbFromDb || QVB_TELEPORT_COORD;



                  const shown: DeviceLocation = {

                    lat: qvbCoords.lat,

                    lng: qvbCoords.lng,

                    accuracy: 10,

                    heading: 0,

                    speed: 0,

                    timestamp: Date.now()

                  };

                  location.setUserLocation(shown);

                  map.setCenterOnPoint({ lat: shown.lat, lng: shown.lng, tick: Date.now(), targetScale: 3.0 });

                  map.setShowOutOfArea(false); // Hide "out of area" modal when teleporting

                  console.log('✅ Teleported to QVB:', {

                    qvb: { lat: qvbCoords.lat, lng: qvbCoords.lng },

                    source: qvbFromDb ? 'database' : 'fallback'

                  });

                  location.setSimulateAtQvb(true);

                } else {

                  // Clear mock arrival mode when stopping simulation
                  location.setMockArrivedLocation(null);

                  location.setSimulateAtQvb(false);

                  if (location.rawLocation) {

                    location.setUserLocation(location.rawLocation);

                  } else {

                    // If stopping simulation but no real GPS, clear user location

                    location.setUserLocation(undefined);

                  }

                }

              }}

            >

              {location.simulateAtQvb ? 'Stop' : 'Teleport QVB'}

            </button>

        </div>

        {/* Off-route warning banner */}

        {navigation.isOffRoute && navigation.activeRoute && (

          <div className="absolute left-0 right-0 top-28 mx-auto w-full max-w-xl px-4 pointer-events-auto">

            <div className="rounded-2xl bg-orange-500 shadow-lg border border-orange-600 px-4 py-3 text-sm font-semibold flex items-center gap-3 text-white animate-pulse">

              <span className="text-xl">⚠️</span>

              <span className="flex-1">You went off route! Distance: {navigation.distanceFromRoute.toFixed(0)}m</span>

            </div>

          </div>

        )}



        {/* Turn-by-turn banner - positioned above navigation card */}

        {navigation.turnByTurnActive && navigation.currentInstruction && !navigation.isOffRoute && (

          <div className="absolute left-0 right-0 bottom-28 mx-auto w-full max-w-xl px-4 pointer-events-auto">

            <div className="rounded-2xl bg-white shadow-md border px-4 py-3 text-sm font-medium flex items-center justify-between gap-3">

              <span>{navigation.currentInstruction}</span>

              <button className="text-xs rounded bg-gray-100 px-2 py-1" onClick={() => { navigation.setTurnByTurnActive(false); navigation.updateInstruction(''); }}>Stop</button>

            </div>

          </div>

        )}

        {/* Top-centered search header */}

        <div className="absolute left-0 right-0 top-4 flex justify-center px-4 pointer-events-none">

          <div className="pointer-events-auto">

            {!search.aiMode ? (

              <SearchWidget

                keyword={search.keyword}

                onKeywordChange={search.setKeyword}

                selectedCategory={search.selectedCategory}

                onCategoryChange={search.setSelectedCategory}

                activeTabs={search.activeTabs}

                onTabToggle={search.handleTabToggle}

                onOpenAI={() => {
                search.setPendingQuery(search.keyword || undefined);
                search.setAiMode(true);
              }}

              allPlaces={allPlaces}
              filteredPlaces={search.filteredPlaces}
              deals={allDeals}
              events={allEvents}
              userLocation={location.userLocation}
              onSelectPlace={handleSearchSelectPlace}

            />

            ) : (

              <div className="w-full max-w-xl h-[70vh] rounded-2xl border bg-white shadow-xl overflow-hidden">

                <AISearch

                  initialQuery={search.pendingQuery}

                  userLocation={location.userLocation}

                  onSelectPlace={handleAiSelectPlace}

                  onSelectDeal={handleAiSelectDeal}

                  onSelectEvent={handleAiSelectEvent}

                  onStartNavigation={handleAiNavigation}

                  onExitAI={search.handleExitAi}

                  entryContext={search.aiEntryContext}

                />

              </div>

            )}

          </div>

        </div>



        {/* Navigation panel */}

        <NavigationPanel

            businesses={search.filteredPlaces}

            userLocation={location.userLocation}

            defaultDestination={navigation.navigationDestination}

            externalStart={navigation.navigationStart}

            externalDestination={navigation.navigationDestination}

            title="Sydney CBD"

            onSelectMyLocation={() => map.setCenterOnUserTick((t) => t + 1)}

            onSelectStartPoint={(point) => map.setCenterOnPoint({ lat: point.lat, lng: point.lng, tick: Date.now(), targetScale: 2.8 })}

            onClearNavigation={clearAllNavigation}

            navigationActive={navigation.navigationActive}

            turnByTurnActive={navigation.turnByTurnActive}

            onStartJourney={(start, destination) => {

              // Use the canonical navigation handler
              console.log('📍 onStartJourney called:', { start, destination });

              startNavigation(start, destination);

            }}

            onStartTurnByTurn={(start, destination) => {

              // Start navigation with turn-by-turn enabled
              console.log('🎯 onStartTurnByTurn called:', { start, destination });

              startNavigation(start, destination, { startTurnByTurn: true });

            }}

            activeRoute={navigation.activeRoute}

            graph={navigation.pathGraph}

            onMockArrival={handleMockArrival}

            onRecenterMap={() => map.setCenterOnUserTick((t) => t + 1)}

            upcomingEventsCount={upcomingEventsCount}

            onShowEvents={() => {
              search.handleTabToggle('events');
            }}

            accessibilityMode={navigation.accessibilityMode}

            onToggleAccessibility={navigation.setAccessibilityMode}

          />



        {/* Out-of-area notice */}

        {map.showOutOfArea && (

          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 p-4 pointer-events-auto">

            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">

              <div className="mb-2 text-lg font-semibold">You are outside this map area</div>

              <p className="mb-4 text-sm text-gray-600">This map covers the Sydney CBD area. You can still try it out by selecting a start point and a destination.</p>

              <div className="flex justify-end gap-2">

                <button className="rounded bg-gray-100 px-4 py-2 text-sm" onClick={() => map.setShowOutOfArea(false)}>Close</button>

              </div>

            </div>

          </div>

        )}



        {/* Location Detail Modal */}

        {map.showLocationModal && map.selected && (

          <div className="pointer-events-auto">

            <LocationDetailModal

              location={map.selected}

              deals={search.dealsByPlaceId.get(map.selected.id) || []}

              events={search.eventsByPlaceId.get(map.selected.id) || []}

              onClose={() => map.setShowLocationModal(false)}

              onSetStart={() => {

                // Extract only Business properties to avoid passing extra marker properties (svg, idx)

                const cleanBusiness: Business = {

                  id: map.selected!.id,

                  name: map.selected!.name,

                  category: map.selected!.category,

                  lat: map.selected!.lat,

                  lng: map.selected!.lng,

                  address: map.selected!.address,

                  priceRange: map.selected!.priceRange,

                  description: map.selected!.description,

                  hours: map.selected!.hours,

                  phone: map.selected!.phone,

                  rating: map.selected!.rating,

                };

                navigation.setNavigationStart(cleanBusiness);

                map.setCenterOnPoint({ lat: map.selected!.lat, lng: map.selected!.lng, tick: Date.now(), targetScale: 2.8 });

                map.setShowLocationModal(false);

                map.setSelected(null);

              }}

              onSetDestination={() => {

                // Extract only Business properties to avoid passing extra marker properties (svg, idx)

                const cleanBusiness: Business = {

                  id: map.selected!.id,

                  name: map.selected!.name,

                  category: map.selected!.category,

                  lat: map.selected!.lat,

                  lng: map.selected!.lng,

                  address: map.selected!.address,

                  priceRange: map.selected!.priceRange,

                  description: map.selected!.description,

                  hours: map.selected!.hours,

                  phone: map.selected!.phone,

                  rating: map.selected!.rating,

                };

                navigation.setNavigationDestination(cleanBusiness);

                map.setCenterOnPoint({ lat: map.selected!.lat, lng: map.selected!.lng, tick: Date.now(), targetScale: 2.8 });

                map.setShowLocationModal(false);

                map.setSelected(null);

              }}

              onTakeMeThere={handleTakeMeThere}

              onOpenIndoorMap={handleOpenIndoorMap}

            />

          </div>

        )}

        {/* Indoor POI Modal */}
        {navigation.selectedIndoorPOI && (
          <div className="pointer-events-auto">
            <IndoorPOIModal
              poi={navigation.selectedIndoorPOI}
              onClose={() => navigation.setSelectedIndoorPOI(null)}
              onSetStart={() => {
                navigation.setIndoorNavigationStart(navigation.selectedIndoorPOI);
                console.log('🎯 Indoor start set:', navigation.selectedIndoorPOI!.name);
              }}
              onSetDestination={() => {
                navigation.setIndoorNavigationDestination(navigation.selectedIndoorPOI);
                console.log('🎯 Indoor destination set:', navigation.selectedIndoorPOI!.name);
              }}
              onTakeMeThere={() => {
                // Set as destination and calculate route if we have a start
                navigation.setIndoorNavigationDestination(navigation.selectedIndoorPOI);
                console.log('🚶 Navigate to:', navigation.selectedIndoorPOI!.name);
                // Route calculation will happen in a useEffect
              }}
            />
          </div>
        )}

      </div>



      {/* Arrival Message - Shows when mock arrival is triggered */}
      {showArrivalMessage && (
        <div
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[99999] animate-in fade-in slide-in-from-top-4 duration-300"
        >
          <div className="bg-green-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3">
            <div className="bg-white/20 rounded-full p-2">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <div className="font-bold text-lg">You have arrived!</div>
              <div className="text-sm text-green-100">Your location has been updated</div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Error Modal - OUTSIDE pointer-events-none container */}

      {navigation.showNavigationError && (

        <div

          className="fixed inset-0 flex items-center justify-center p-4"

          style={{

            backgroundColor: 'rgba(0, 0, 0, 0.5)',

            zIndex: 99999,

            pointerEvents: 'auto'

          }}

          onClick={(e) => {

            // Click backdrop to close and stop navigation

            if (e.target === e.currentTarget) {

              console.log('🔴 BACKDROP CLICKED - STOPPING NAVIGATION AND CLOSING MODAL');

              clearAllNavigation();

            }

          }}

        >

          <div

            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl relative"

            style={{

              pointerEvents: 'auto'

            }}

          >

            <div className="mb-3 text-xl font-bold text-red-600">❌ No Route Found</div>

            <p className="mb-6 whitespace-pre-line text-sm text-gray-700 leading-relaxed">{navigation.navigationErrorMessage}</p>



            <div className="text-center text-sm text-gray-500 italic">

              Click outside this box to close

            </div>

          </div>

        </div>

      )}



      {/* Debug Overlay (hidden for demo) */}

      {/* <MapDebugOverlay

        userLocation={userLocation}

        rawLocation={rawLocation}

        navigationStart={navigationStart}

        navigationDestination={navigationDestination}

        isOffRoute={isOffRoute}

        distanceFromRoute={distanceFromRoute}

        activeRoute={activeRoute}

        compassHeading={compassHeading}

        smoothedHeading={userLocation?.heading ?? undefined}

        showGraphOverlay={showGraphOverlay}

        onToggleGraphOverlay={() => setShowGraphOverlay(!showGraphOverlay)}

        pathfindingDiag={pathfindingDiag}

      /> */}

    </>

  );

}

/**
 * PERF-1: Main Page with Context Providers
 * Wraps PageContent with all context providers for clean state management
 */
export default function Page() {
  return (
    <AppProvider>
      <GPSTracker />
      <NavigationEngine />
      <IndoorNavigation />
      <DataLoader />
      <PageContent />
    </AppProvider>
  );
}
