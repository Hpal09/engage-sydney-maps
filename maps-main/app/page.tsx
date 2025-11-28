"use client";



// Extend DeviceOrientationEvent to include iOS-specific compass property

declare global {

  interface DeviceOrientationEvent {

    webkitCompassHeading?: number;

  }

}



import { useCallback, useEffect, useState, useRef, useMemo } from 'react';

import { throttle } from 'lodash-es';
import { getKalmanFilterManager } from '@/lib/kalmanFilter';

import { X } from 'lucide-react';

import CustomSydneyMap from '@/components/Map/CustomSydneyMap';

import AISearch from '@/components/Search/AISearch';

import SearchWidget from '@/components/Search/SearchWidget';

import MapDebugOverlay from '@/components/Debug/MapDebugOverlay';

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

import LocationDetailModal from '@/components/Location/LocationDetailModal';
import IndoorPOIModal from '@/components/Location/IndoorPOIModal';

import { validateGraph, logValidationResult } from '@/lib/graphValidator';

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



export default function Page() {

  const [selected, setSelected] = useState<Business | null>(null);

  const [allPlaces, setAllPlaces] = useState<Business[]>([]);

  const [filteredPlaces, setFilteredPlaces] = useState<Business[]>([]);

  const [visibleBusinesses, setVisibleBusinesses] = useState<Business[]>([]);

  const [userLocation, setUserLocation] = useState<DeviceLocation | undefined>(undefined);

  const [rawLocation, setRawLocation] = useState<DeviceLocation | undefined>(undefined);

  const [allDeals, setAllDeals] = useState<Deal[]>([]);

  const [allEvents, setAllEvents] = useState<Event[]>([]);



  // Search state

  const [keyword, setKeyword] = useState('');

  const [selectedCategory, setSelectedCategory] = useState('All categories');

  const [activeTabs, setActiveTabs] = useState<Set<'deals' | 'events' | 'experiences'>>(new Set());

  // Toggle handler for multi-select tabs
  const handleTabToggle = useCallback((tab: 'deals' | 'events' | 'experiences') => {
    setActiveTabs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tab)) {
        newSet.delete(tab);
      } else {
        newSet.add(tab);
      }
      return newSet;
    });
  }, []);

  const aiEntryContext = useMemo<AIEntryContext>(() => {
    if (keyword.trim()) return { type: 'query', query: keyword.trim() };
    if (selectedCategory && selectedCategory !== 'All categories') {
      return { type: 'category', category: selectedCategory };
    }
    if (activeTabs.has('deals')) return { type: 'category', category: 'deals' };
    if (activeTabs.has('events') || activeTabs.has('experiences')) return { type: 'category', category: 'events' };
    return { type: 'fresh' };
  }, [keyword, selectedCategory, activeTabs]);

  const [aiMode, setAiMode] = useState(false);

  const [pendingQuery, setPendingQuery] = useState<string | undefined>(undefined);

  const [nearMeOnly, setNearMeOnly] = useState(false);

  const [navigationActive, setNavigationActive] = useState(false);

  const [activeRoute, setActiveRoute] = useState<PathNode[] | null>(null);

  const [pathGraph, setPathGraph] = useState<import('@/types').PathGraph | null>(null);

  const intersections: Intersection[] = getIntersectionsWithGps();

  const [centerOnUserTick, setCenterOnUserTick] = useState(0);

  const [centerOnPoint, setCenterOnPoint] = useState<{ lat: number; lng: number; tick: number; targetScale?: number } | null>(null);

  // Indoor navigation state
  const [indoorModeActive, setIndoorModeActive] = useState(false);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [buildingData, setBuildingData] = useState<any>(null);
  const [selectedIndoorPOI, setSelectedIndoorPOI] = useState<any>(null);
  const [indoorNavigationStart, setIndoorNavigationStart] = useState<any>(null);
  const [indoorNavigationDestination, setIndoorNavigationDestination] = useState<any>(null);
  const [indoorRoute, setIndoorRoute] = useState<Array<{x: number; y: number; floorId?: string}> | null>(null);
  const [currentFloorSvgContent, setCurrentFloorSvgContent] = useState<string>('');
  const [allFloorSvgContent, setAllFloorSvgContent] = useState<Map<string, string>>(new Map());

  // Hybrid navigation state
  const [buildingEntrances, setBuildingEntrances] = useState<any[]>([]);
  const [hybridRouteActive, setHybridRouteActive] = useState(false);
  const [hybridGraph, setHybridGraph] = useState<Map<string, any> | null>(null);

  const [debugTransformLogTick, setDebugTransformLogTick] = useState(0);

  const [showOutOfArea, setShowOutOfArea] = useState(false);

  const [showLocationModal, setShowLocationModal] = useState(false);

  const [showNavigationError, setShowNavigationError] = useState(false);

  const [navigationErrorMessage, setNavigationErrorMessage] = useState('');

  const [navigationStart, setNavigationStart] = useState<Business | null>(null);

  const [navigationDestination, setNavigationDestination] = useState<Business | null>(null);

  const [turnByTurnActive, setTurnByTurnActive] = useState(false);

  const [currentInstruction, setCurrentInstruction] = useState<string>('');

  const [navMarker, setNavMarker] = useState<{ x: number; y: number; angleDeg: number } | null>(null);

  const [smoothNavMarker, setSmoothNavMarker] = useState<{ x: number; y: number; angleDeg: number } | null>(null);

  const navMarkerRef = useRef<{ x: number; y: number; angleDeg: number } | null>(null);

  const [simulateAtQvb, setSimulateAtQvb] = useState(false);

  const [routeProgress, setRouteProgress] = useState<number>(0); // Track how far along the route the user is (0-1)

  const [remainingRoute, setRemainingRoute] = useState<PathNode[] | null>(null); // Only the route ahead

  const [isOffRoute, setIsOffRoute] = useState<boolean>(false); // Track if user went off route

  const [distanceFromRoute, setDistanceFromRoute] = useState<number>(0); // Distance in meters from route

  const [showArrivalMessage, setShowArrivalMessage] = useState(false); // Show "You have arrived" message

  const [mockArrivedLocation, setMockArrivedLocation] = useState<DeviceLocation | null>(null); // Mock arrival mode - overrides GPS

  const [compassHeading, setCompassHeading] = useState<number | null>(null);

  const [mapRotation, setMapRotation] = useState<number>(0); // Map rotation in degrees (0 = north-up, heading = heading-up)

  const [showGraphOverlay, setShowGraphOverlay] = useState(false);

  const [pathfindingDiag, setPathfindingDiag] = useState<PathfindingDiagnostics | null>(null);

  const [zoomConfig, setZoomConfig] = useState<ZoomConfig | null>(null);

  const lastShownRef = useRef<{ lat: number; lng: number; timestamp?: number } | null>(null);

  const lastHeadingRef = useRef<number>(0);

  const smoothAlphaRef = useRef<number>(SMOOTHING.GPS_HEADING_ALPHA);

  const lastCompassHeadingRef = useRef<number>(0);

  const lastCompassUpdateRef = useRef<number>(0);

  const compassSmoothAlphaRef = useRef<number>(SMOOTHING.COMPASS_HEADING_ALPHA);

  const compassSetupRef = useRef<(() => void) | null>(null);



  const projectLatLng = useCallback((lat: number, lng: number) => gpsToSvg(lat, lng), []);



  // Build deals and events maps grouped by place ID

  const dealsByPlaceId = useMemo(() => {

    const now = new Date();

    const map = new Map<string, Deal[]>();



    allDeals.forEach(deal => {

      // Only include live deals that haven't expired

      if (deal.isLive && new Date(deal.endsAt) >= now) {

        const deals = map.get(deal.placeId) || [];

        deals.push(deal);

        map.set(deal.placeId, deals);

      }

    });



    return map;

  }, [allDeals]);



  const eventsByPlaceId = useMemo(() => {

    const now = new Date();

    const map = new Map<string, Event[]>();



    allEvents.forEach(event => {

      // Only include live events that haven't ended yet

      if (event.isLive && event.placeId && new Date(event.endsAt) >= now) {

        const events = map.get(event.placeId) || [];

        events.push(event);

        map.set(event.placeId, events);

      }

    });



    return map;

  }, [allEvents]);

  const handleExitAi = useCallback(() => {
    setAiMode(false);
    setPendingQuery(undefined);
  }, []);

  const handleAiSelectPlace = useCallback((placeId: string) => {
    const place = allPlaces.find((p) => p.id === placeId);
    if (!place) {
      console.warn('AI select place not found', placeId);
      return;
    }
    setSelected(place);
    setShowLocationModal(true);
    setCenterOnPoint({ lat: place.lat, lng: place.lng, tick: Date.now(), targetScale: zoomConfig?.destination ?? 2.8 });
    handleExitAi();
  }, [allPlaces, handleExitAi, zoomConfig]);

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
    setSelected(place);
    setCenterOnPoint({
      lat: place.lat,
      lng: place.lng,
      tick: Date.now(),
      targetScale: zoomConfig?.destination ?? 2.8,
    });
  }, [allPlaces, zoomConfig]);

  const handleOpenIndoorMap = useCallback(async (placeId: string) => {
    try {
      const response = await fetch(`/api/indoor-nav/${placeId}`);
      if (!response.ok) {
        console.error('Failed to fetch building data');
        return;
      }
      const data = await response.json();
      setBuildingData(data.building);
      setIndoorModeActive(true);
      // Select the first floor (ground floor)
      if (data.building?.floors?.length > 0) {
        setSelectedFloorId(data.building.floors[0].id);
      }
    } catch (error) {
      console.error('Error opening indoor map:', error);
    }
  }, []);

  const handleExitIndoorMode = useCallback(() => {
    setIndoorModeActive(false);
    setSelectedFloorId(null);
    setBuildingData(null);
    setSelectedIndoorPOI(null);
  }, []);

  const handleIndoorPOIClick = useCallback((poi: any) => {
    setSelectedIndoorPOI(poi);
  }, []);

  // Load SVG content for ALL floors when building data loads
  useEffect(() => {
    if (!indoorModeActive || !buildingData?.floors) {
      setAllFloorSvgContent(new Map());
      setCurrentFloorSvgContent('');
      return;
    }

    // Load SVG for all floors
    const loadPromises = buildingData.floors.map(async (floor: any) => {
      if (!floor.svgPath) return { floorId: floor.id, content: '' };
      try {
        const response = await fetch(floor.svgPath);
        const content = await response.text();
        return { floorId: floor.id, content };
      } catch (err) {
        console.error(`Failed to load SVG for floor ${floor.id}:`, err);
        return { floorId: floor.id, content: '' };
      }
    });

    Promise.all(loadPromises).then(results => {
      const svgMap = new Map<string, string>();
      results.forEach(({ floorId, content }) => {
        if (content) svgMap.set(floorId, content);
      });
      setAllFloorSvgContent(svgMap);
      console.log(`📄 Loaded SVG content for ${svgMap.size} floors`);
    });
  }, [indoorModeActive, buildingData]);

  // PHASE 1: Clear indoor graph cache when exiting indoor mode
  useEffect(() => {
    if (!indoorModeActive) {
      // Dynamically import and call cache clearing function
      import('@/lib/indoorPathfinding').then(({ clearIndoorGraphCache }) => {
        clearIndoorGraphCache();
      });
    }
  }, [indoorModeActive]);

  // Load building entrances for hybrid navigation
  useEffect(() => {
    async function loadBuildingEntrances() {
      try {
        const res = await fetch('/api/buildings/entrances');
        const data = await res.json();
        setBuildingEntrances(data.entrances || []);
        console.log(`🚪 Loaded ${data.entrances?.length || 0} building entrances for hybrid navigation`);
      } catch (error) {
        console.error('Failed to load building entrances:', error);
      }
    }
    loadBuildingEntrances();
  }, []);

  // Build hybrid graph when outdoor graph, building entrances, and indoor SVG are ready
  useEffect(() => {
    if (!pathGraph || buildingEntrances.length === 0 || allFloorSvgContent.size === 0) {
      // Wait for all components to be loaded
      console.log('⏳ Waiting for hybrid graph components:', {
        pathGraph: !!pathGraph,
        entrances: buildingEntrances.length,
        floorSvg: allFloorSvgContent.size
      });
      return;
    }

    async function buildHybrid() {
      try {
        if (!pathGraph) {
          console.error('pathGraph is null in buildHybrid');
          return;
        }

        console.log('🔧 Building hybrid navigation graph...');
        console.log('  - Outdoor graph:', Object.keys(pathGraph.nodesById).length, 'nodes');
        console.log('  - Building entrances:', buildingEntrances.length);
        console.log('  - Indoor floors:', allFloorSvgContent.size);

        // Convert outdoor graph to Map format expected by buildHybridGraph
        // The outdoor graph uses adjacency list format, need to convert to edges Map
        const outdoorGraphMap = new Map();
        Object.entries(pathGraph.nodesById).forEach(([id, node]) => {
          const edges = new Map();
          // Convert adjacency list to edges Map
          const adjacentEdges = pathGraph!.adjacency[id] || [];
          adjacentEdges.forEach((edge: any) => {
            // Edge property is 'to', not 'target'
            edges.set(edge.to, edge.distance);
          });

          outdoorGraphMap.set(id, {
            ...node,
            edges,
          });
        });

        // Build indoor graphs for each floor with SVG content
        const indoorGraphs = new Map();

        // Group SVG content by building
        const buildingFloors = new Map<string, Array<{floorId: string; svgContent: string}>>();

        // Get building info from entrances
        const buildingIds = [...new Set(buildingEntrances.map(e => e.buildingId))];

        for (const buildingId of buildingIds) {
          const floors: Array<{floorId: string; svgContent: string}> = [];

          // Find all floors for this building from entrances
          const buildingEntranceFloors = buildingEntrances
            .filter(e => e.buildingId === buildingId)
            .map(e => e.floorId);

          for (const floorId of new Set(buildingEntranceFloors)) {
            const svgContent = allFloorSvgContent.get(floorId);
            if (svgContent) {
              floors.push({ floorId, svgContent });
            }
          }

          if (floors.length > 0) {
            buildingFloors.set(buildingId, floors);
          }
        }

        console.log('  - Building indoor graphs for', buildingFloors.size, 'buildings...');

        // Build indoor graph for each building using multi-floor pathfinding
        for (const [buildingId, floors] of buildingFloors.entries()) {
          try {
            // Parse SVG paths for each floor
            const { parseSvgPaths, buildMultiFloorGraph } = await import('@/lib/indoorPathfinding');

            const floorData = floors.map(floor => {
              const segments = parseSvgPaths(floor.svgContent);
              return {
                floorId: floor.floorId,
                segments,
                svgContent: floor.svgContent
              };
            });

            const indoorGraph = buildMultiFloorGraph(floorData);
            indoorGraphs.set(buildingId, indoorGraph);
            console.log(`    ✓ Built indoor graph for building ${buildingId}:`, indoorGraph.size, 'nodes');
          } catch (error) {
            console.error(`    ✗ Failed to build indoor graph for building ${buildingId}:`, error);
          }
        }

        const hybrid = await buildHybridGraph(
          outdoorGraphMap,
          buildingEntrances,
          indoorGraphs
        );

        setHybridGraph(hybrid);
        console.log('✅ Hybrid graph built:', hybrid.size, 'total nodes (outdoor + indoor + entrance portals)');
      } catch (error) {
        console.error('❌ Failed to build hybrid graph:', error);
      }
    }

    buildHybrid();
  }, [pathGraph, buildingEntrances, allFloorSvgContent]);

  // Update current floor SVG when selected floor changes
  useEffect(() => {
    if (!selectedFloorId) {
      setCurrentFloorSvgContent('');
      return;
    }
    const content = allFloorSvgContent.get(selectedFloorId) || '';
    setCurrentFloorSvgContent(content);
  }, [selectedFloorId, allFloorSvgContent]);

  // HYBRID NAVIGATION DETECTION: Check for outdoor ↔ indoor routes
  useEffect(() => {
    // Detect hybrid scenario: outdoor start + indoor destination OR indoor start + outdoor destination
    const hasOutdoorStart = navigationStart && !indoorNavigationStart;
    const hasIndoorDestination = indoorNavigationDestination && !navigationDestination;
    const hasIndoorStart = indoorNavigationStart && !navigationStart;
    const hasOutdoorDestination = navigationDestination && !indoorNavigationDestination;

    if ((hasOutdoorStart && hasIndoorDestination) || (hasIndoorStart && hasOutdoorDestination)) {
      console.log('🔀 HYBRID NAVIGATION DETECTED!');
      console.log('  Start:', hasOutdoorStart ? `Outdoor (${navigationStart?.name})` : `Indoor (${indoorNavigationStart?.name})`);
      console.log('  Destination:', hasIndoorDestination ? `Indoor (${indoorNavigationDestination?.name})` : `Outdoor (${navigationDestination?.name})`);

      // Trigger hybrid pathfinding
      if (hybridGraph) {
        async function calculateHybridRoute() {
          try {
            if (!hybridGraph) {
              console.error('hybridGraph is null');
              return;
            }

            const start = hasOutdoorStart
              ? { lat: navigationStart!.lat, lng: navigationStart!.lng }
              : { buildingId: indoorNavigationStart!.buildingId, floorId: indoorNavigationStart!.floorId, x: indoorNavigationStart!.x, y: indoorNavigationStart!.y };

            const end = hasIndoorDestination
              ? { buildingId: indoorNavigationDestination!.buildingId, floorId: indoorNavigationDestination!.floorId, x: indoorNavigationDestination!.x, y: indoorNavigationDestination!.y }
              : { lat: navigationDestination!.lat, lng: navigationDestination!.lng };

            console.log('🚀 Calling findHybridRoute...', { start, end });
            const hybridRoute = await findHybridRoute(hybridGraph, start, end);

            if (hybridRoute) {
              console.log('✅ Hybrid route found!', hybridRoute);
              setHybridRouteActive(true);
              // TODO: Convert hybrid route to displayable format
              // For now, just log the segments
              hybridRoute.segments.forEach((seg, i) => {
                console.log(`  Segment ${i + 1}: ${seg.type} (${seg.nodes.length} nodes, ${seg.distance.toFixed(1)}m)`);
              });
            } else {
              console.error('❌ No hybrid route found');
              setNavigationErrorMessage('Could not find a route between outdoor and indoor locations.');
              setShowNavigationError(true);
            }
          } catch (error) {
            console.error('❌ Hybrid pathfinding error:', error);
            setNavigationErrorMessage('Error calculating hybrid route: ' + error);
            setShowNavigationError(true);
          }
        }

        calculateHybridRoute();
      } else {
        console.warn('⚠️ Hybrid graph not ready yet');
      }
    }
  }, [navigationStart, navigationDestination, indoorNavigationStart, indoorNavigationDestination, hybridGraph]);

  // Calculate indoor route when start and destination are set
  useEffect(() => {
    if (!indoorNavigationStart || !indoorNavigationDestination || allFloorSvgContent.size === 0) {
      setIndoorRoute(null);
      return;
    }

    console.log('🗺️  Calculating indoor route from', indoorNavigationStart.name, 'to', indoorNavigationDestination.name);

    // Check if on same floor - use single-floor pathfinding
    if (indoorNavigationStart.floorId === indoorNavigationDestination.floorId) {
      const floorSvg = allFloorSvgContent.get(indoorNavigationStart.floorId);
      if (!floorSvg) {
        console.error('Floor SVG not loaded');
        setIndoorRoute(null);
        return;
      }

      const result = findPathBetweenPOIs(
        floorSvg,
        { x: indoorNavigationStart.x, y: indoorNavigationStart.y },
        { x: indoorNavigationDestination.x, y: indoorNavigationDestination.y }
      );

      if (result) {
        // Add floor ID to each node
        const nodesWithFloor = result.nodes.map(node => ({
          ...node,
          floorId: indoorNavigationStart.floorId,
        }));
        setIndoorRoute(nodesWithFloor);
        console.log('✅ Single-floor route calculated:', nodesWithFloor.length, 'nodes');
      } else {
        setIndoorRoute(null);
        console.warn('❌ Could not find single-floor route');
      }
    } else {
      // Multi-floor pathfinding
      console.log('🪜 Using multi-floor pathfinding');

      const floors = Array.from(allFloorSvgContent.entries()).map(([floorId, svgContent]) => ({
        floorId,
        svgContent,
      }));

      findMultiFloorPath(
        floors,
        {
          x: indoorNavigationStart.x,
          y: indoorNavigationStart.y,
          floorId: indoorNavigationStart.floorId,
        },
        {
          x: indoorNavigationDestination.x,
          y: indoorNavigationDestination.y,
          floorId: indoorNavigationDestination.floorId,
        }
      ).then(result => {
        if (result) {
          setIndoorRoute(result.nodes);
          console.log('✅ Multi-floor route calculated:', result.nodes.length, 'nodes');
        } else {
          setIndoorRoute(null);
          console.warn('❌ Could not find multi-floor route');
        }
      }).catch(err => {
        console.error('Multi-floor pathfinding error:', err);
        setIndoorRoute(null);
      });
    }
  }, [indoorNavigationStart, indoorNavigationDestination, allFloorSvgContent]);

  // Load places, deals, and events on mount

  useEffect(() => {

    (async () => {

      // Calibration is set up in CustomSydneyMap.tsx via setCalibration()

      // coordinateMapper.ts will use the affine transform from CONTROL_POINTS

      console.log('✅ GPS coordinate mapping configured (calibration set in CustomSydneyMap)');



      const [placesRes, dealsRes, eventsRes, zoomConfigRes] = await Promise.all([

        fetch('/api/places').then(r => r.json()),

        fetch('/api/deals').then(r => r.json()),

        fetch('/api/events').then(r => r.json()),

        fetch('/api/map-settings').then(r => r.json()).catch(() => ({
          initial: 2.5,
          placeStart: 2.8,
          destination: 2.8,
          navigation: 3.0,
        })),

      ]);



      // Validate API responses before using them
      if (!Array.isArray(placesRes)) {
        console.error('❌ Failed to load places from API:', placesRes);
        setAllPlaces([]);
        setFilteredPlaces([]);
        setVisibleBusinesses([]);
        return;
      }

      if (!Array.isArray(dealsRes)) {
        console.error('❌ Failed to load deals from API:', dealsRes);
        setAllDeals([]);
      }

      if (!Array.isArray(eventsRes)) {
        console.error('❌ Failed to load events from API:', eventsRes);
        setAllEvents([]);
      }

      console.log("DEBUG allPlaces from DB:", placesRes.length);

      const rawPlaces = placesRes as Business[];

      const normalizedPlaces = rawPlaces.map((place) => ({

        ...place,

        lat: normalizeLatitude(place.lat),

        lng: normalizeLongitude(place.lng),

      }));

      const correctedCount = rawPlaces.reduce((count, place, idx) => {

        const normalized = normalizedPlaces[idx];

        return count + (normalized.lat !== place.lat || normalized.lng !== place.lng ? 1 : 0);
      }, 0);

      if (correctedCount > 0) {

        console.warn(`[GeoNormalize] Corrected ${correctedCount} place coordinate pairs from API payload`);

      }





      setAllPlaces(normalizedPlaces);

      setAllDeals(Array.isArray(dealsRes) ? dealsRes as Deal[] : []);

      setAllEvents(Array.isArray(eventsRes) ? eventsRes as Event[] : []);

      setZoomConfig(zoomConfigRes as ZoomConfig);

      setFilteredPlaces(normalizedPlaces); // initial view = all

      setVisibleBusinesses(normalizedPlaces); // Show all businesses on map



      console.log('📊 Data loaded:', {

        places: normalizedPlaces.length,

        deals: dealsRes.length,

        events: eventsRes.length,

        zoomConfig: zoomConfigRes

      });

    })();

  }, []);

  // Handle shared POI link (e.g., ?poi=business-id)
  useEffect(() => {
    if (allPlaces.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const poiId = params.get('poi');

    if (poiId) {
      const poi = allPlaces.find(place => place.id === poiId);
      if (poi) {
        setSelected(poi);
        // Clean up URL without reloading page
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [allPlaces]);

  // Comprehensive filtering logic: keyword + category + tab + nearMe

  useEffect(() => {

    let result = [...allPlaces];



    // Keyword filter (simple, case-insensitive)

    if (keyword.trim()) {

      const q = keyword.toLowerCase();

      result = result.filter(place =>

        place.name.toLowerCase().includes(q) ||

        (place.category?.toLowerCase().includes(q))

      );

    }



    // Category filter - exact match

    if (selectedCategory !== "All categories") {

      result = result.filter(place => place.category === selectedCategory);

      console.log('📂 Filtered by category:', selectedCategory, '→', result.length, 'places');

    }



    // Tab filter - multi-select toggle tabs (Deals, Events, Experiences)
    // If no tabs active, show all. If one or more active, show places matching ANY active tab.

    if (activeTabs.size > 0) {

      // Define filter criteria for each tab type
      const placeIdsWithDeals = new Set(allDeals.map(deal => deal.placeId));
      const dealTags = ['deal', 'deals', 'discount', 'offer', 'promotion', 'sale', 'special'];
      const dealCategories = ['cafe', 'restaurant', 'food & drink', 'food court', 'thai', 'chinese', 'japanese', 'malaysian', 'coffee'];

      const placeIdsWithEvents = new Set(
        allEvents.filter(event => event.placeId).map(event => event.placeId!)
      );
      const eventTags = ['event', 'events', 'live', 'show', 'concert', 'performance', 'venue', 'theatre'];
      const eventCategories = ['venue', 'theatre', 'theater', 'bar', 'pub', 'club', 'music', 'entertainment'];

      const experienceTags = ['experience', 'experiences', 'tour', 'activity', 'attraction', 'museum', 'gallery', 'landmark', 'heritage', 'historic', 'shopping'];
      const experienceCategories = ['experiences', 'attraction', 'museum', 'gallery', 'shopping', 'shopping center', 'landmark', 'park', 'garden'];

      result = result.filter(place => {
        const placeTags = (place.tags || []).map(t => t.toLowerCase());
        const category = (place.category || '').toLowerCase();

        // Check if place matches ANY active tab (OR logic)
        if (activeTabs.has('deals')) {
          if (placeIdsWithDeals.has(place.id)) return true;
          if (dealTags.some(tag => placeTags.includes(tag))) return true;
          if (dealCategories.some(cat => category.includes(cat))) return true;
        }

        if (activeTabs.has('events')) {
          if (placeIdsWithEvents.has(place.id)) return true;
          if (eventTags.some(tag => placeTags.includes(tag))) return true;
          if (eventCategories.some(cat => category.includes(cat))) return true;
        }

        if (activeTabs.has('experiences')) {
          if (experienceTags.some(tag => placeTags.includes(tag))) return true;
          if (experienceCategories.some(cat => category.includes(cat))) return true;
        }

        return false;
      });

      console.log('🏷️ Filtered by active tabs:', Array.from(activeTabs), '→', result.length, 'places');

    }



    // Near me filter (if enabled and user location available)

    if (nearMeOnly && userLocation) {

      const RADIUS_METERS = 800;



      result = result

        .map(place => {

          const distance = calculateDistance(

            { lat: userLocation.lat, lng: userLocation.lng },

            { lat: place.lat, lng: place.lng }

          );

          return { place, distance };

        })

        .filter(item => item.distance <= RADIUS_METERS)

        .sort((a, b) => a.distance - b.distance)

        .map(item => item.place);

    }



    setFilteredPlaces(result);

    setVisibleBusinesses(result); // Show all filtered businesses on map

  }, [allPlaces, allDeals, allEvents, keyword, selectedCategory, activeTabs, nearMeOnly, userLocation]);


  // PHASE 1: Throttled GPS processing function to reduce overhead
  // useMemo creates a stable throttled function that won't change on every render
  const processGPSUpdate = useMemo(
    () => throttle(
      (pos: GeolocationPosition) => {
        // Skip GPS updates if we're in mock arrival mode
        if (mockArrivedLocation) {
          console.log('📍 GPS update skipped - mock arrival mode active');
          return;
        }

        const fresh: DeviceLocation = {

          lat: pos.coords.latitude,

          lng: pos.coords.longitude,

          accuracy: pos.coords.accuracy,

          heading: pos.coords.heading,

          speed: pos.coords.speed,

          timestamp: pos.timestamp,

        };



        // GPS FILTERING: Reject low-accuracy readings to prevent jumps

        // PHASE 1 OPTIMIZATION: Balanced accuracy filter for urban/indoor environments

        // UPDATED: Relaxed from 30m to 50m to reduce location jumping in urban areas

        const MAX_ACCURACY = parseInt(process.env.NEXT_PUBLIC_GPS_MAX_ACCURACY || '50', 10); // meters - relaxed for better position continuity

        if (!simulateAtQvb && fresh.accuracy && fresh.accuracy > MAX_ACCURACY) {

          console.warn('⚠️ GPS accuracy too low, ignoring:', fresh.accuracy.toFixed(1) + 'm (max: ' + MAX_ACCURACY + 'm)');

          return;

        }



        // GPS FILTERING: Reject unrealistic position jumps (teleportation detection)

        // RELAXED: Account for GPS update delays (maximumAge: 3000ms) and allow faster movement

        if (lastShownRef.current && !simulateAtQvb) {

          const distanceFromLast = calculateDistance(

            lastShownRef.current,

            { lat: fresh.lat, lng: fresh.lng }

          );

          const timeDelta = ((fresh.timestamp || 0) - (lastShownRef.current.timestamp || 0)) / 1000; // seconds

          // UPDATED: Relaxed from 2.5 to 3.5 m/s to allow faster GPS position corrections

          const MAX_WALKING_SPEED = parseFloat(process.env.NEXT_PUBLIC_GPS_MAX_WALKING_SPEED || '3.5'); // m/s (~12.6 km/h) - allows GPS corrections and fast walking



          if (timeDelta > 0 && distanceFromLast / timeDelta > MAX_WALKING_SPEED) {

            console.warn('⚠️ GPS jump detected (too fast), ignoring:', {

              distance: distanceFromLast.toFixed(1) + 'm',

              time: timeDelta.toFixed(1) + 's',

              speed: (distanceFromLast / timeDelta).toFixed(1) + 'm/s',

              maxAllowed: MAX_WALKING_SPEED + 'm/s'

            });

            return;

          }

        }



        setRawLocation(fresh);

        let shown = simulateAtQvb ? createMockQvbLocation() : fresh;



        // Log successful GPS acquisition for debugging

        console.log('✅ GPS location accepted:', {

          lat: fresh.lat.toFixed(6),

          lng: fresh.lng.toFixed(6),

          accuracy: fresh.accuracy ? fresh.accuracy.toFixed(1) + 'm' : 'unknown',

          heading: fresh.heading !== null && fresh.heading !== undefined ? fresh.heading.toFixed(1) + '°' : 'none'

        });



        // Derive heading if none provided using last position

        // High-quality heading: prefer device; otherwise derive and smooth

        let derivedHeading: number | null = null;

        if (typeof shown.heading !== 'number' || Number.isNaN(shown.heading)) {

          if (lastShownRef.current) {

            const delta = calculateDistance(lastShownRef.current, { lat: shown.lat, lng: shown.lng });

            if (delta > 0.8) {

              derivedHeading = computeBearingDegrees(lastShownRef.current, { lat: shown.lat, lng: shown.lng });

            }

          }

        } else {

          derivedHeading = shown.heading ?? null;

        }

        // TELEPORT QVB: Bypass heading smoothing when simulating
        if (!simulateAtQvb && derivedHeading !== null) {

          const currentHeading = lastHeadingRef.current ?? derivedHeading;

          const speed = shown.speed ?? 0;



          // Check if heading update should be applied (movement threshold)

          if (shouldUpdateHeading(

            speed,

            currentHeading,

            derivedHeading,

            SMOOTHING.SPEED_STATIONARY_THRESHOLD,

            SMOOTHING.HEADING_MIN_CHANGE_STATIONARY

          )) {

            const smoothed = angularLerp(currentHeading, derivedHeading, smoothAlphaRef.current);

            shown = { ...shown, heading: smoothed };

            lastHeadingRef.current = smoothed;

            console.log('📍 GPS heading updated:', {

              raw: derivedHeading.toFixed(1),

              smoothed: smoothed.toFixed(1),

              speed: speed.toFixed(2),

              moving: speed > SMOOTHING.SPEED_STATIONARY_THRESHOLD

            });

          } else {

            // Keep previous heading to prevent jitter

            shown = { ...shown, heading: currentHeading };

            console.log('📍 Keeping previous GPS heading - change too small');

          }

        } else if (simulateAtQvb && derivedHeading !== null) {
          // Apply heading directly without smoothing for teleport
          shown = { ...shown, heading: derivedHeading };
          lastHeadingRef.current = derivedHeading;
        }

        // GPS SMOOTHING: Apply position smoothing to reduce jitter
        // TELEPORT QVB: Bypass position smoothing when simulating
        // IMPORTANT: Keep smoothing light to preserve actual position for wrong turn detection

        if (!simulateAtQvb && lastShownRef.current) {

          const speed = shown.speed ?? 0;

          const isStationary = speed < SMOOTHING.SPEED_STATIONARY_THRESHOLD;

          const isWalking = speed >= SMOOTHING.SPEED_STATIONARY_THRESHOLD && speed < SMOOTHING.SPEED_WALKING_MAX;



          if (isStationary) {

            // More aggressive smoothing when standing still to reduce jitter

            shown = {

              ...shown,

              lat: lastShownRef.current.lat + (shown.lat - lastShownRef.current.lat) * SMOOTHING.POSITION_STATIONARY_ALPHA,

              lng: lastShownRef.current.lng + (shown.lng - lastShownRef.current.lng) * SMOOTHING.POSITION_STATIONARY_ALPHA,

            };

            console.log('📍 Position smoothed (stationary)');

          } else if (isWalking) {

            // Light smoothing when walking - preserve actual position for wrong turn detection

            shown = {

              ...shown,

              lat: lastShownRef.current.lat + (shown.lat - lastShownRef.current.lat) * SMOOTHING.POSITION_WALKING_ALPHA,

              lng: lastShownRef.current.lng + (shown.lng - lastShownRef.current.lng) * SMOOTHING.POSITION_WALKING_ALPHA,

            };

            console.log('📍 Position smoothed (walking)');

          }

          // No smoothing when moving faster - show real position immediately

        }



        // PHASE 6: Apply Kalman filter for smoother GPS tracking
        const useKalmanFilter = process.env.NEXT_PUBLIC_USE_KALMAN_FILTER !== 'false';
        if (useKalmanFilter && !simulateAtQvb) {
          const kalmanManager = getKalmanFilterManager();
          const filtered = kalmanManager.processGPS(
            shown.lat,
            shown.lng,
            shown.accuracy,
            shown.heading ?? undefined
          );

          // Use filtered coordinates
          shown = {
            ...shown,
            lat: filtered.lat,
            lng: filtered.lng
          };

          console.log('🎯 Kalman filter applied');
        }

        lastShownRef.current = { lat: shown.lat, lng: shown.lng, timestamp: shown.timestamp };

        setUserLocation(shown);

        // Check if user is within map bounds; if far, show modal once

        const here = { lat: shown.lat, lng: shown.lng };

        if (!isWithinMapBounds(here)) {

          setShowOutOfArea(true);

        } else {

          // User is back within bounds - hide the modal

          setShowOutOfArea(false);

          // Google Maps style: Always default start to "My location" when GPS is available
          // This auto-sets on initial load and resets after clearing navigation
          // User can still manually override to a different start point
          if (!navigationStart) {
            const myLocationBusiness: Business = {
              id: 'my-location',
              name: 'My location',
              category: 'Current Position',
              lat: shown.lat,
              lng: shown.lng,
            };
            setNavigationStart(myLocationBusiness);
            console.log('📍 Auto-set start to "My location" (Google Maps style)');
          }

        }

        // Update instruction if active

        if (turnByTurnActive && activeRoute) {

          const graph = (window as any).__SYD_GRAPH__ as import('@/types').PathGraph;
          const res = getNextInstruction(activeRoute, here, graph);

          setCurrentInstruction(res.text);

          if (res.reachedDestination) {

            setTurnByTurnActive(false);

          }

          // Don't auto-center - let user pan freely and use recenter button when needed

        }



        // IMPROVED NAV MARKER CALCULATION - Google Maps style

        if (activeRoute && activeRoute.length >= 2) {

          try {

            // If start point is NOT "my-location", keep marker at route start during turn-by-turn
            // This handles the case where user selects a POI as start point for demo purposes
            if (turnByTurnActive && navigationStart && navigationStart.id !== 'my-location') {
              const startPoint = activeRoute[0];
              const nextPoint = activeRoute[1];

              // Use device heading if available, otherwise use route direction
              let angleDeg: number;
              if (typeof shown.heading === 'number' && !Number.isNaN(shown.heading)) {
                angleDeg = shown.heading - 90; // Convert GPS heading to SVG rotation
              } else {
                const dx = nextPoint.x - startPoint.x;
                const dy = nextPoint.y - startPoint.y;
                angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
              }

              const marker = { x: startPoint.x, y: startPoint.y, angleDeg };
              navMarkerRef.current = marker;
              setNavMarker(marker);
              return; // Skip the normal position tracking
            }

            // Convert user position to SVG coordinates ONCE (not in loop!)

            const userSvgPos = projectLatLng(shown.lat, shown.lng);



            // Find nearest SEGMENT (not just nearest point)

            let bestSegIdx = 0;

            let bestDistToSegment = Infinity;



            for (let i = 0; i < activeRoute.length - 1; i++) {

              const a = activeRoute[i];

              const b = activeRoute[i + 1];



              // Calculate distance from user to this segment

              const abx = b.x - a.x;

              const aby = b.y - a.y;

              const apx = userSvgPos.x - a.x;

              const apy = userSvgPos.y - a.y;

              const abLen2 = Math.max(1, abx * abx + aby * aby);

              let t = (apx * abx + apy * aby) / abLen2;

              t = Math.max(0, Math.min(1, t));



              // Point on segment closest to user

              const projX = a.x + t * abx;

              const projY = a.y + t * aby;



              // Distance from user to this projected point

              const distToSeg = Math.hypot(userSvgPos.x - projX, userSvgPos.y - projY);



              if (distToSeg < bestDistToSegment) {

                bestDistToSegment = distToSeg;

                bestSegIdx = i;

              }

            }



            // Now project onto the best segment

            const a = activeRoute[bestSegIdx];

            const b = activeRoute[bestSegIdx + 1];



            const abx = b.x - a.x;

            const aby = b.y - a.y;

            const apx = userSvgPos.x - a.x;

            const apy = userSvgPos.y - a.y;

            const abLen2 = Math.max(1, abx * abx + aby * aby);

            let t = (apx * abx + apy * aby) / abLen2;



            // Allow slight extension beyond segment endpoints for smoother tracking

            t = Math.max(-0.1, Math.min(1.1, t));



            const projX = a.x + t * abx;

            const projY = a.y + t * aby;



            // Calculate angle: Use device heading if available, otherwise use route direction
            // UX ENHANCEMENT: Use device heading (gyro/compass) for better navigation UX

            let angleDeg: number;

            const useDeviceHeading = process.env.NEXT_PUBLIC_USE_DEVICE_HEADING_POINTER !== 'false';

            if (useDeviceHeading && effectiveHeading !== null && !Number.isNaN(effectiveHeading)) {

              // Use combined device heading (GPS + compass/gyro) for where user is facing

              // GPS heading is 0° = North, 90° = East, 180° = South, 270° = West

              // SVG rotation: 0° = East, 90° = South, 180° = West, 270° = North

              // Convert GPS heading to SVG rotation: subtract 90° to align North with upward

              angleDeg = effectiveHeading - 90;

              console.log('🧭 Navigation pointer using device heading:', effectiveHeading.toFixed(1) + '°');

            } else {

              // Fallback: Use route segment direction when heading unavailable (stationary)

              const angleRad = Math.atan2(aby, abx);

              angleDeg = (angleRad * 180) / Math.PI;

              console.log('📍 Navigation pointer using route direction (no heading available)');

            }



            // OFF-ROUTE DETECTION: Only active when turn-by-turn is enabled
            // For walking, we allow some deviation but detect clear wrong turns

            const OFF_ROUTE_THRESHOLD = 200; // meters - increased for demo with simulated locations

            const distanceInMeters = bestDistToSegment * 0.1; // Approximate conversion from SVG units to meters



            setDistanceFromRoute(distanceInMeters);



            // Only check off-route when turn-by-turn is active (not during preview)
            if (turnByTurnActive) {
              if (distanceInMeters > OFF_ROUTE_THRESHOLD) {

                if (!isOffRoute) {

                  console.warn('⚠️ USER WENT OFF ROUTE! Distance:', distanceInMeters.toFixed(1) + 'm');

                  setIsOffRoute(true);

                }

              } else {

                if (isOffRoute) {

                  console.log('✅ User back on route');

                  setIsOffRoute(false);

                }

              }
            } else {
              // Clear off-route state when not in turn-by-turn mode
              if (isOffRoute) {
                setIsOffRoute(false);
              }
            }



            const newMarker = { x: projX, y: projY, angleDeg };

            navMarkerRef.current = newMarker;

            setNavMarker(newMarker);



            // Update remaining route (Google Maps style - only show route ahead)

            // Include current segment point + all segments from current position onwards

            const remaining = [

              { ...a, x: projX, y: projY }, // Current position on route

              ...activeRoute.slice(bestSegIdx + 1) // All remaining points

            ];

            setRemainingRoute(remaining);

            setRouteProgress(bestSegIdx / (activeRoute.length - 1));



            // Removed verbose logging for performance

          } catch (err) {

            console.error('Nav marker calculation error:', err);

          }

        } else {

          setNavMarker(null);

          navMarkerRef.current = null;

          setRemainingRoute(null);

          setRouteProgress(0);

        }

      },
      parseInt(process.env.NEXT_PUBLIC_GPS_THROTTLE_MS || '1000', 10) // PHASE 1: Throttle to max 1 update per second
    ),
    [mockArrivedLocation, simulateAtQvb, activeRoute, projectLatLng, turnByTurnActive, navigationStart]
  );

  useEffect(() => {

    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(

      processGPSUpdate,

      (error) => {

        console.error('Geolocation error:', error);

      },

      {
        enableHighAccuracy: true,
        maximumAge: parseInt(process.env.NEXT_PUBLIC_GPS_MAXIMUM_AGE || '5000', 10),  // PHASE 1: Increased to 5000ms to reduce update frequency
        timeout: 15000
      }

    );

    return () => navigator.geolocation.clearWatch(watchId);

  }, [processGPSUpdate]); // PHASE 1: Simplified dependencies - processGPSUpdate includes all needed deps



  // Smooth animation for the nav marker - 60fps interpolation

  useEffect(() => {

    if (!navMarker) {
      setSmoothNavMarker(null);
      return;
    }

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

  }, [navMarker]);



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



        console.log('🧭 Compass heading updated:', {

          raw: rawHeading.toFixed(1),

          smoothed: smoothedHeading.toFixed(1),

          previous: currentSmoothed.toFixed(1),

          platform: event.webkitCompassHeading !== undefined ? 'iOS' : 'Android'

        });



        lastCompassHeadingRef.current = smoothedHeading;

        lastCompassUpdateRef.current = now;

        setCompassHeading(smoothedHeading);

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

    if (!turnByTurnActive || !activeRoute) return;

    const here = userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : undefined;

    const graph = (window as any).__SYD_GRAPH__ as import('@/types').PathGraph;
    const msg = getNextInstruction(activeRoute, here, graph).text;

    setCurrentInstruction(msg);

  }, [turnByTurnActive, activeRoute, userLocation]);



  // Preload the simplified graph on first render and validate it

  useEffect(() => {

    (async () => {

      if (!(window as any).__SYD_GRAPH__) {

        console.log('📦 Loading navigation graph...');

        const g = await buildPathNetwork();

        (window as any).__SYD_GRAPH__ = g;
        setPathGraph(g);

        const totalEdges = Object.values(g.adjacency).reduce((a, b) => a + b.length, 0);
        const edgesWithStreets = Object.values(g.adjacency).flat().filter(e => e.street).length;
        console.log('✅ Graph loaded:', Object.keys(g.nodesById).length, 'nodes', totalEdges, 'edges');
        console.log('🏷️  Street names:', edgesWithStreets, 'edges have street names');



        // Validate graph quality

        const validation = validateGraph(g);

        logValidationResult(validation);



        if (!validation.isValid) {

          console.error('⚠️  Graph validation failed! Navigation may not work correctly.');

          console.error('   Consider running: npm run build:graph');

        }

      } else {
        // Graph already loaded, just set the state
        setPathGraph((window as any).__SYD_GRAPH__);
      }

    })();

  }, []);



  // Helper function to clear all navigation state

  const clearAllNavigation = () => {

    console.log('🧹 Clearing all navigation state');

    setNavigationStart(null);

    setNavigationDestination(null);

    setActiveRoute(null);

    setRemainingRoute(null);

    setRouteProgress(0);

    setNavigationActive(false);

    setTurnByTurnActive(false);

    setCurrentInstruction('');

    setNavMarker(null);

    setSmoothNavMarker(null);

    navMarkerRef.current = null;

    setIsOffRoute(false);

    setDistanceFromRoute(0);

    setShowNavigationError(false);

    // Reset map rotation to north-up
    setMapRotation(0);
    console.log('🧭 Map rotation reset to north-up (0°)');

    // Recenter on current location if available
    if (userLocation) {
      setCenterOnUserTick((t) => t + 1);
      console.log('📍 Recentered on user location after clearing navigation');
    }

  };

  /**
   * Mock Arrival Handler - For demo purposes
   * Sets user location to destination and shows arrival message
   */
  const handleMockArrival = (destination: { lat: number; lng: number; label: string }) => {
    console.log('🎯 Mock arrival at:', destination.label);

    // Disable QVB simulation if active (we're now simulating arrival location instead)
    if (simulateAtQvb) {
      setSimulateAtQvb(false);
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
    setMockArrivedLocation(arrivedLocation);
    setUserLocation(arrivedLocation);

    // Show arrival message
    setShowArrivalMessage(true);

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
    setNavigationStart(myLocationBusiness);
    console.log('📍 Updated navigation start to arrival location:', destination.label);

    // Center on new location
    setCenterOnPoint({ lat: destination.lat, lng: destination.lng, tick: Date.now(), targetScale: 3.0 });

    // Hide message after 3 seconds
    setTimeout(() => {
      setShowArrivalMessage(false);
    }, 3000);
  };

  // Combine GPS heading with compass heading (compass as fallback)

  const effectiveHeading = userLocation?.heading ?? compassHeading ?? 0;

  // Update map rotation continuously during turn-by-turn navigation
  useEffect(() => {
    if (turnByTurnActive && effectiveHeading !== null) {
      // Rotate map so heading points upward (Google Maps style)
      setMapRotation(effectiveHeading);
      console.log('🧭 Updating map rotation to heading:', effectiveHeading);
    }
  }, [effectiveHeading, turnByTurnActive]);



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

        Object.values(g.adjacency).reduce((a, b) => a + b.length, 0), 'edges');

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

      setPathfindingDiag(diagnostics);  // Store for debug overlay



      if (diagnostics.route.length >= 2) {

        const route = diagnostics.route;

        setActiveRoute(route);

        setRemainingRoute(route);

        setRouteProgress(0);

        setNavigationActive(true);

        setShowNavigationError(false);



        // Position arrow at starting point

        const startPoint = route[0];

        const nextPoint = route[1];

        const dx = nextPoint.x - startPoint.x;

        const dy = nextPoint.y - startPoint.y;

        const angleRad = Math.atan2(dy, dx);

        const angleDeg = (angleRad * 180) / Math.PI;



        const initialMarker = { x: startPoint.x, y: startPoint.y, angleDeg };

        setNavMarker(initialMarker);

        navMarkerRef.current = initialMarker;

        setSmoothNavMarker(initialMarker);



        console.log('🎯 Arrow positioned at start:', { x: startPoint.x, y: startPoint.y, angle: angleDeg });



        // Handle turn-by-turn activation if requested
        if (options?.startTurnByTurn) {
          setTurnByTurnActive(true);
          const graph = (window as any).__SYD_GRAPH__ as import('@/types').PathGraph;
          const msg = getNextInstruction(route, userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : undefined, graph).text;
          setCurrentInstruction(msg);
          // Set initial map rotation to current heading (Google Maps style)
          const heading = userLocation?.heading ?? compassHeading ?? 0;
          setMapRotation(heading);
          // Recenter on user to start turn-by-turn experience with configured zoom
          if (userLocation) {
            setCenterOnPoint({ lat: userLocation.lat, lng: userLocation.lng, tick: Date.now(), targetScale: zoomConfig?.navigationStart ?? 3.5 });
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

    setNavigationErrorMessage(

      'Unable to find a walkable route between these locations. ' +

      'This could mean:\n\n' +

      '• One or both locations are outside the walkable street network\n' +

      '• The locations are in disconnected areas of the map\n' +

      '• The navigation graph needs to be rebuilt\n\n' +

      'Please try selecting different locations that are on streets or walkways.'

    );

    setShowNavigationError(true);

    setNavigationActive(false);

    setActiveRoute(null);

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

    setNavigationDestination(cleanBusiness);



    if (userLocation) {

      // Create a pseudo-Business from user location
      // IMPORTANT: Use 'my-location' to match NavigationPanel's options id

      const userLocationBusiness: Business = {

        id: 'my-location',

        name: 'My location',

        category: 'Current Position',

        lat: userLocation.lat,

        lng: userLocation.lng,

      };



      // Set start

      setNavigationStart(userLocationBusiness);



      // Close modal

      setShowLocationModal(false);

      setSelected(null);



      // Start navigation

      startNavigation(userLocationBusiness, cleanBusiness);

    } else {

      // No user location - just set destination and close modal

      // User can select start manually from NavigationPanel

      console.warn("No userLocation available – please select a starting point or enable location.");

      setShowLocationModal(false);

      setSelected(null);

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
    setCenterOnPoint({ lat: place.lat, lng: place.lng, tick: Date.now(), targetScale: zoomConfig?.destination ?? 2.8 });
    handleTakeMeThere(place);
  }, [allPlaces, allDeals, allEvents, handleExitAi, handleTakeMeThere, zoomConfig]);


  // Debug: Log what we're passing to the map

  useEffect(() => {

    console.log('🗺️ Map props:', {

      hasActiveRoute: !!activeRoute,

      activeRouteLength: activeRoute?.length,

      hasSmoothNavMarker: !!smoothNavMarker,

      smoothNavMarker: smoothNavMarker,

      turnByTurnActive,

      hasUserLocation: !!userLocation,

      gpsHeading: userLocation?.heading,

      compassHeading: compassHeading,

      effectiveHeading: effectiveHeading

    });

  }, [activeRoute, smoothNavMarker, turnByTurnActive, userLocation, compassHeading, effectiveHeading]);

  // Memoize business click handler to prevent unnecessary re-renders and event listener churn
  const handleBusinessClick = useCallback((business: Business) => {
    setSelected(business);
    setShowLocationModal(true);
  }, []);

  return (

    <>

      {/* LAYER 1: Full-screen map background */}

      <div className="fixed inset-0 z-0">

        <CustomSydneyMap
          businesses={visibleBusinesses}
          selectedBusiness={selected}
          userLocation={userLocation ? { ...userLocation, heading: effectiveHeading } : undefined}
          onBusinessClick={handleBusinessClick}
          activeRoute={remainingRoute || activeRoute}

          onCenterOnUser={Boolean(centerOnUserTick)}

          onCenterOnPoint={centerOnPoint}

          smoothNavMarker={turnByTurnActive ? smoothNavMarker : null}

          navigationStart={navigationStart}
          navigationDestination={navigationDestination}
          showGraphOverlay={showGraphOverlay}
          debugTransformLogTick={debugTransformLogTick}
          zoomConfig={zoomConfig || undefined}
          mapRotation={mapRotation}
          turnByTurnActive={turnByTurnActive}
          showPOIMarkers={activeTabs.size > 0}
          indoorModeActive={indoorModeActive}
          buildingData={buildingData}
          selectedFloorId={selectedFloorId}
          onExitIndoorMode={handleExitIndoorMode}
          onFloorChange={setSelectedFloorId}
          onIndoorPOIClick={handleIndoorPOIClick}
          indoorNavigationStart={indoorNavigationStart}
          indoorNavigationDestination={indoorNavigationDestination}
          indoorRoute={indoorRoute}
        />
      </div>



      {/* LAYER 2: UI elements floating on top */}

      <div className="fixed inset-0 z-10 pointer-events-none">

        {/* Utility buttons - positioned on the right side below map controls */}

        <div className="absolute right-4 top-[300px] z-20 flex flex-col gap-2 pointer-events-auto">

          <button

            className={`rounded px-3 py-2 text-xs shadow ${nearMeOnly ? 'bg-blue-600 text-white border-blue-700' : 'bg-white/90 hover:bg-white'}`}

            onClick={() => {

              if (!nearMeOnly && !userLocation) {

                alert('⚠️ Location not available. Please enable GPS.');

                return;

              }

              setNearMeOnly(!nearMeOnly);

            }}

          >

            {nearMeOnly ? '📍 Near Me' : '📍 Near Me'}

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

            className={`rounded px-3 py-2 text-xs shadow ${simulateAtQvb ? 'bg-green-600 text-white border-green-700' : 'bg-white/90 hover:bg-white'}`}

            onClick={() => {

                console.log('[TeleportQVB] button clicked', { simulateAtQvb });

                setDebugTransformLogTick(Date.now());

                if (!simulateAtQvb) {

                  // Clear mock arrival mode when teleporting
                  setMockArrivedLocation(null);

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

                  setUserLocation(shown);

                  setCenterOnPoint({ lat: shown.lat, lng: shown.lng, tick: Date.now(), targetScale: 3.0 });

                  setShowOutOfArea(false); // Hide "out of area" modal when teleporting

                  console.log('✅ Teleported to QVB:', {

                    qvb: { lat: qvbCoords.lat, lng: qvbCoords.lng },

                    source: qvbFromDb ? 'database' : 'fallback'

                  });

                  setSimulateAtQvb(true);

                } else {

                  // Clear mock arrival mode when stopping simulation
                  setMockArrivedLocation(null);

                  setSimulateAtQvb(false);

                  if (rawLocation) {

                    setUserLocation(rawLocation);

                  } else {

                    // If stopping simulation but no real GPS, clear user location

                    setUserLocation(undefined);

                  }

                }

              }}

            >

              {simulateAtQvb ? 'Stop' : 'Teleport QVB'}

            </button>

        </div>

        {/* Off-route warning banner */}

        {isOffRoute && activeRoute && (

          <div className="absolute left-0 right-0 top-28 mx-auto w-full max-w-xl px-4 pointer-events-auto">

            <div className="rounded-2xl bg-orange-500 shadow-lg border border-orange-600 px-4 py-3 text-sm font-semibold flex items-center gap-3 text-white animate-pulse">

              <span className="text-xl">⚠️</span>

              <span className="flex-1">You went off route! Distance: {distanceFromRoute.toFixed(0)}m</span>

            </div>

          </div>

        )}



        {/* Turn-by-turn banner - positioned above navigation card */}

        {turnByTurnActive && currentInstruction && !isOffRoute && (

          <div className="absolute left-0 right-0 bottom-28 mx-auto w-full max-w-xl px-4 pointer-events-auto">

            <div className="rounded-2xl bg-white shadow-md border px-4 py-3 text-sm font-medium flex items-center justify-between gap-3">

              <span>{currentInstruction}</span>

              <button className="text-xs rounded bg-gray-100 px-2 py-1" onClick={() => { setTurnByTurnActive(false); setCurrentInstruction(''); }}>Stop</button>

            </div>

          </div>

        )}

        {/* Top-centered search header */}

        <div className="absolute left-0 right-0 top-4 flex justify-center px-4 pointer-events-none">

          <div className="pointer-events-auto">

            {!aiMode ? (

              <SearchWidget

                keyword={keyword}

                onKeywordChange={setKeyword}

                selectedCategory={selectedCategory}

                onCategoryChange={setSelectedCategory}

                activeTabs={activeTabs}

                onTabToggle={handleTabToggle}

                onOpenAI={() => {
                setPendingQuery(keyword || undefined);
                setAiMode(true);
              }}

              allPlaces={allPlaces}
              filteredPlaces={filteredPlaces}
              deals={allDeals}
              events={allEvents}
              userLocation={userLocation}
              onSelectPlace={handleSearchSelectPlace}

            />

            ) : (

              <div className="w-full max-w-xl h-[70vh] rounded-2xl border bg-white shadow-xl overflow-hidden">

                <AISearch

                  initialQuery={pendingQuery}

                  userLocation={userLocation}

                  onSelectPlace={handleAiSelectPlace}

                  onSelectDeal={handleAiSelectDeal}

                  onSelectEvent={handleAiSelectEvent}

                  onStartNavigation={handleAiNavigation}

                  onExitAI={handleExitAi}

                  entryContext={aiEntryContext}

                />

              </div>

            )}

          </div>

        </div>



        {/* Navigation panel */}

        <NavigationPanel

            businesses={visibleBusinesses}

            userLocation={userLocation}

            defaultDestination={navigationDestination}

            externalStart={navigationStart}

            externalDestination={navigationDestination}

            title="Sydney CBD"

            onSelectMyLocation={() => setCenterOnUserTick((t) => t + 1)}

            onSelectStartPoint={(point) => setCenterOnPoint({ lat: point.lat, lng: point.lng, tick: Date.now(), targetScale: 2.8 })}

            onClearNavigation={clearAllNavigation}

            navigationActive={navigationActive}

            turnByTurnActive={turnByTurnActive}

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

            activeRoute={activeRoute}

            graph={pathGraph}

            onMockArrival={handleMockArrival}

          />



        {/* Out-of-area notice */}

        {showOutOfArea && (

          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 p-4 pointer-events-auto">

            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">

              <div className="mb-2 text-lg font-semibold">You are outside this map area</div>

              <p className="mb-4 text-sm text-gray-600">This map covers the Sydney CBD area. You can still try it out by selecting a start point and a destination.</p>

              <div className="flex justify-end gap-2">

                <button className="rounded bg-gray-100 px-4 py-2 text-sm" onClick={() => setShowOutOfArea(false)}>Close</button>

              </div>

            </div>

          </div>

        )}



        {/* Location Detail Modal */}

        {showLocationModal && selected && (

          <div className="pointer-events-auto">

            <LocationDetailModal

              location={selected}

              deals={dealsByPlaceId.get(selected.id) || []}

              events={eventsByPlaceId.get(selected.id) || []}

              onClose={() => setShowLocationModal(false)}

              onSetStart={() => {

                // Extract only Business properties to avoid passing extra marker properties (svg, idx)

                const cleanBusiness: Business = {

                  id: selected.id,

                  name: selected.name,

                  category: selected.category,

                  lat: selected.lat,

                  lng: selected.lng,

                  address: selected.address,

                  priceRange: selected.priceRange,

                  description: selected.description,

                  hours: selected.hours,

                  phone: selected.phone,

                  rating: selected.rating,

                };

                setNavigationStart(cleanBusiness);

                setCenterOnPoint({ lat: selected.lat, lng: selected.lng, tick: Date.now(), targetScale: 2.8 });

                setShowLocationModal(false);

                setSelected(null);

              }}

              onSetDestination={() => {

                // Extract only Business properties to avoid passing extra marker properties (svg, idx)

                const cleanBusiness: Business = {

                  id: selected.id,

                  name: selected.name,

                  category: selected.category,

                  lat: selected.lat,

                  lng: selected.lng,

                  address: selected.address,

                  priceRange: selected.priceRange,

                  description: selected.description,

                  hours: selected.hours,

                  phone: selected.phone,

                  rating: selected.rating,

                };

                setNavigationDestination(cleanBusiness);

                setCenterOnPoint({ lat: selected.lat, lng: selected.lng, tick: Date.now(), targetScale: 2.8 });

                setShowLocationModal(false);

                setSelected(null);

              }}

              onTakeMeThere={handleTakeMeThere}

              onOpenIndoorMap={handleOpenIndoorMap}

            />

          </div>

        )}

        {/* Indoor POI Modal */}
        {selectedIndoorPOI && (
          <div className="pointer-events-auto">
            <IndoorPOIModal
              poi={selectedIndoorPOI}
              onClose={() => setSelectedIndoorPOI(null)}
              onSetStart={() => {
                setIndoorNavigationStart(selectedIndoorPOI);
                console.log('🎯 Indoor start set:', selectedIndoorPOI.name);
              }}
              onSetDestination={() => {
                setIndoorNavigationDestination(selectedIndoorPOI);
                console.log('🎯 Indoor destination set:', selectedIndoorPOI.name);
              }}
              onTakeMeThere={() => {
                // Set as destination and calculate route if we have a start
                setIndoorNavigationDestination(selectedIndoorPOI);
                console.log('🚶 Navigate to:', selectedIndoorPOI.name);
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

      {showNavigationError && (

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

            <p className="mb-6 whitespace-pre-line text-sm text-gray-700 leading-relaxed">{navigationErrorMessage}</p>



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
