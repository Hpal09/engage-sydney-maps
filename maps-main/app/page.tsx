"use client";



// Extend DeviceOrientationEvent to include iOS-specific compass property

declare global {

  interface DeviceOrientationEvent {

    webkitCompassHeading?: number;

  }

}



import { useCallback, useEffect, useState, useRef, useMemo } from 'react';

import CustomSydneyMap from '@/components/Map/CustomSydneyMap';

import AISearch from '@/components/Search/AISearch';

import SearchWidget from '@/components/Search/SearchWidget';

import MapDebugOverlay from '@/components/Debug/MapDebugOverlay';

import type { Business, DeviceLocation, Intersection, PathNode, ZoomConfig } from '@/types';

import type { AIEntryContext } from '@/types/ai';

import type { Deal, Event } from '@/lib/dataService';

import { getIntersectionsWithGps } from '@/data/intersections';

import { findAnyRoute, findRoute, findRouteWithDiagnostics, type PathfindingDiagnostics } from '@/lib/pathfinding';

import { buildPathNetwork } from '@/lib/graphLoader';

import { gpsToSvg, calculateDistance, isWithinMapBounds, setCalibration, getSvgBounds, normalizeLatitude, normalizeLongitude } from '@/lib/coordinateMapper';

import { getNextInstruction } from '@/lib/turnByTurn';

import NavigationPanel from '@/components/Navigation/NavigationPanel';

import LocationDetailModal from '@/components/Location/LocationDetailModal';

import { validateGraph, logValidationResult } from '@/lib/graphValidator';



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
  lat: -33.87168857220928,
  lng: 151.2067044424637,
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

  const [selectedTab, setSelectedTab] = useState<'all' | 'deals' | 'events' | 'experiences' | 'places'>('all');

  const aiEntryContext = useMemo<AIEntryContext>(() => {
    if (keyword.trim()) return { type: 'query', query: keyword.trim() };
    if (selectedCategory && selectedCategory !== 'All categories') {
      return { type: 'category', category: selectedCategory };
    }
    if (selectedTab === 'deals') return { type: 'category', category: 'deals' };
    if (selectedTab === 'events' || selectedTab === 'experiences') return { type: 'category', category: 'events' };
    return { type: 'fresh' };
  }, [keyword, selectedCategory, selectedTab]);

  const [aiMode, setAiMode] = useState(false);

  const [pendingQuery, setPendingQuery] = useState<string | undefined>(undefined);

  const [nearMeOnly, setNearMeOnly] = useState(false);

  const [navigationActive, setNavigationActive] = useState(false);

  const [activeRoute, setActiveRoute] = useState<PathNode[] | null>(null);

  const intersections: Intersection[] = getIntersectionsWithGps();

  const [centerOnUserTick, setCenterOnUserTick] = useState(0);

  const [centerOnPoint, setCenterOnPoint] = useState<{ lat: number; lng: number; tick: number; targetScale?: number } | null>(null);

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

      setVisibleBusinesses(normalizedPlaces.slice(0, 8)); // Show first 8 initially



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



    // Tab filter

    if (selectedTab === "places" || selectedTab === "all") {

      // For now, places/all behave the same – all businesses.

    } else if (selectedTab === "deals") {

      // Filter to only places that have active deals

      const placeIdsWithDeals = new Set(allDeals.map(deal => deal.placeId));

      result = result.filter(place => placeIdsWithDeals.has(place.id));

      console.log('🏷️ Filtered to places with deals:', result.length);

    } else if (selectedTab === "events") {

      // Filter to only places hosting events

      const placeIdsWithEvents = new Set(

        allEvents.filter(event => event.placeId).map(event => event.placeId!)

      );

      result = result.filter(place => placeIdsWithEvents.has(place.id));

      console.log('📅 Filtered to places with events:', result.length);

    } else if (selectedTab === "experiences") {

      console.log("TODO: filter by curated experiences");

      // TODO: Filter to only places tagged as "experiences"

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

    setVisibleBusinesses(result.slice(0, 8)); // Show first 8 of filtered results

  }, [allPlaces, allDeals, allEvents, keyword, selectedCategory, selectedTab, nearMeOnly, userLocation]);



  useEffect(() => {

    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(

      (pos) => {

        const fresh: DeviceLocation = {

          lat: pos.coords.latitude,

          lng: pos.coords.longitude,

          accuracy: pos.coords.accuracy,

          heading: pos.coords.heading,

          speed: pos.coords.speed,

          timestamp: pos.timestamp,

        };



        // GPS FILTERING: Reject low-accuracy readings to prevent jumps

        // For walking navigation, we need good accuracy to detect wrong turns

        const MAX_ACCURACY = 50; // meters - tighter for walking to detect wrong turns

        if (!simulateAtQvb && fresh.accuracy && fresh.accuracy > MAX_ACCURACY) {

          console.warn('⚠️ GPS accuracy too low, ignoring:', fresh.accuracy.toFixed(1) + 'm');

          return;

        }



        // GPS FILTERING: Reject unrealistic position jumps (teleportation detection)

        // Tuned for WALKING speeds only

        if (lastShownRef.current && !simulateAtQvb) {

          const distanceFromLast = calculateDistance(

            lastShownRef.current,

            { lat: fresh.lat, lng: fresh.lng }

          );

          const timeDelta = ((fresh.timestamp || 0) - (lastShownRef.current.timestamp || 0)) / 1000; // seconds

          const MAX_WALKING_SPEED = 4; // m/s (~14 km/h) - fast running pace, allows for brief sprints



          if (timeDelta > 0 && distanceFromLast / timeDelta > MAX_WALKING_SPEED) {

            console.warn('⚠️ GPS jump detected (too fast for walking), ignoring:', {

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



            // Calculate angle based on segment direction

            const angleRad = Math.atan2(aby, abx);

            const angleDeg = (angleRad * 180) / Math.PI;



            // OFF-ROUTE DETECTION: Only active when turn-by-turn is enabled
            // For walking, we allow some deviation but detect clear wrong turns

            const OFF_ROUTE_THRESHOLD = 25; // meters - if further than this, user went off route

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



            console.log('📍 Nav marker updated:', {

              x: projX.toFixed(2),

              y: projY.toFixed(2),

              angle: angleDeg.toFixed(2),

              segmentIdx: bestSegIdx,

              distanceFromRoute: distanceInMeters.toFixed(1) + 'm',

              offRoute: isOffRoute,

              progress: (bestSegIdx / (activeRoute.length - 1) * 100).toFixed(1) + '%'

            });

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

      (error) => {

        console.error('Geolocation error:', error);

      },

      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }

    );

    return () => navigator.geolocation.clearWatch(watchId);

  }, [activeRoute, projectLatLng, turnByTurnActive, simulateAtQvb]);



  // Smooth animation for the nav marker - 60fps interpolation

  useEffect(() => {

    console.log('🔄 Smooth animation effect triggered, navMarker:', navMarker);

    if (!navMarker) {

      console.log('❌ No navMarker, setting smoothNavMarker to null');

      setSmoothNavMarker(null);

      return;

    }

    

    console.log('✅ Starting smooth animation loop');

    // Animate the nav marker smoothly using requestAnimationFrame

    let animationFrame: number;

    const animate = () => {

      // Capture the current target to avoid race conditions

      const target = navMarkerRef.current;

      if (!target) {
        // Navigation was cleared, stop animation
        return;
      }



      setSmoothNavMarker(prev => {

        if (!prev) {

          console.log('🎬 First frame, initializing smoothNavMarker:', target);

          return target;

        }



        // Double-check target is still valid

        if (!target) return prev;



        // Smooth position interpolation

        const smoothFactor = 0.3; // Higher = faster catch-up (0.1-0.5)

        const newX = prev.x + (target.x - prev.x) * smoothFactor;

        const newY = prev.y + (target.y - prev.y) * smoothFactor;



        // Smooth angle interpolation with wrapping

        let angleDiff = target.angleDeg - prev.angleDeg;

        // Handle angle wrapping (shortest path)

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



      window.addEventListener('deviceorientation', handleOrientation, true);

      console.log('✅ Compass listener added');



      return () => {

        window.removeEventListener('deviceorientation', handleOrientation, true);

        console.log('🛑 Compass listener removed');

      };

    };



    setupCompass();

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



      // Use diagnostics function for better debugging and fallback
      // Pass Place IDs for pre-defined route matching
      const diagnostics = findRouteWithDiagnostics(graph, startInt, endInt, start.id, destination.id);

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

      const userLocationBusiness: Business = {

        id: 'user-location',

        name: 'My Location',

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



  return (

    <>

      {/* LAYER 1: Full-screen map background */}

      <div className="fixed inset-0 z-0">

        <CustomSydneyMap
          businesses={visibleBusinesses}
          selectedBusiness={selected}
          userLocation={userLocation ? { ...userLocation, heading: effectiveHeading } : undefined}
          onBusinessClick={(b) => { setSelected(b); setShowLocationModal(true); }}
          activeRoute={remainingRoute || activeRoute}

          onCenterOnUser={Boolean(centerOnUserTick)}

          onCenterOnPoint={centerOnPoint}

          smoothNavMarker={activeRoute ? smoothNavMarker : null}

          navigationStart={navigationStart}
          navigationDestination={navigationDestination}
          showGraphOverlay={showGraphOverlay}
          debugTransformLogTick={debugTransformLogTick}
          zoomConfig={zoomConfig || undefined}
          mapRotation={mapRotation}
          turnByTurnActive={turnByTurnActive}
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

              if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {

                try {

                  const permission = await (DeviceOrientationEvent as any).requestPermission();

                  if (permission === 'granted') {

                    alert('🧭 Compass enabled! Your arrow will now rotate with your device.');

                  } else {

                    alert('⚠️ Compass permission denied. Please enable in Settings.');

                  }

                } catch (error) {

                  console.error('Error requesting compass:', error);

                }

              } else {

                alert('🧭 Compass already active! Rotate your device to see the arrow move.');

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

                selectedTab={selectedTab}

                onTabChange={setSelectedTab}

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

            />

          </div>

        )}

      </div>



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



      {/* Debug Overlay (development only) */}

      <MapDebugOverlay

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

      />

    </>

  );

}
