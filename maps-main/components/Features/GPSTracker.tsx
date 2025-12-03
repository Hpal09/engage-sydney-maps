"use client";

import { useEffect, useRef, useMemo, useCallback } from 'react';
import { throttle } from 'lodash-es';
import { useLocation } from '@/contexts/LocationContext';
import { useNavigation } from '@/contexts/NavigationContext';
import { useMap } from '@/contexts/MapContext';
import {
  gpsToSvg,
  calculateDistance,
  isWithinMapBounds,
  normalizeLatitude,
  normalizeLongitude,
} from '@/lib/coordinateMapper';
import { getKalmanFilterManager } from '@/lib/kalmanFilter';
import { getNextInstruction } from '@/lib/turnByTurn';
import type { Business, DeviceLocation } from '@/types';

/**
 * PERF-1: GPS Tracker Component
 * Handles all GPS processing, smoothing, and nav marker updates
 * Extracted from main Page component for better separation of concerns
 */

// GPS smoothing constants
const SMOOTHING = {
  GPS_HEADING_ALPHA: 0.3,
  POSITION_STATIONARY_ALPHA: 0.4,
  POSITION_WALKING_ALPHA: 0.7,
  SPEED_STATIONARY_THRESHOLD: 0.5,
  SPEED_WALKING_MAX: 2.5,
  HEADING_MIN_CHANGE_STATIONARY: 15,
} as const;

const QVB_TELEPORT_COORD = Object.freeze({
  lat: -33.87085879712593,
  lng: 151.20695855393757,
});

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

function shouldUpdateHeading(
  speed: number | null | undefined,
  oldHeading: number,
  newHeading: number,
  stationaryThreshold: number,
  minChangeWhenStationary: number
): boolean {
  if (speed && speed > stationaryThreshold) return true;
  const diff = Math.abs(newHeading - oldHeading);
  const normalizedDiff = diff > 180 ? 360 - diff : diff;
  return normalizedDiff > minChangeWhenStationary;
}

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

export default function GPSTracker() {
  const location = useLocation();
  const navigation = useNavigation();
  const map = useMap();
  
  const lastShownRef = useRef<{ lat: number; lng: number; timestamp?: number } | null>(null);
  const lastHeadingRef = useRef<number>(0);
  const smoothAlphaRef = useRef<number>(SMOOTHING.GPS_HEADING_ALPHA);
  const navMarkerRef = useRef<{ x: number; y: number; angleDeg: number } | null>(null);

  const projectLatLng = useCallback((lat: number, lng: number) => gpsToSvg(lat, lng), []);

  // Store context values in refs to avoid recreating throttle function
  const locationRef = useRef(location);
  const navigationRef = useRef(navigation);
  const mapRef = useRef(map);

  // Update refs when context values change (doesn't trigger re-render of useMemo)
  useEffect(() => {
    locationRef.current = location;
    navigationRef.current = navigation;
    mapRef.current = map;
  }, [location, navigation, map]);

  // GPS processing function - CRITICAL FIX: dependencies removed to prevent throttle recreation
  const processGPSUpdate = useMemo(
    () => throttle(
      (pos: GeolocationPosition) => {
        const location = locationRef.current;
        const navigation = navigationRef.current;
        const map = mapRef.current;
        // Skip GPS updates if in mock arrival mode
        if (location.mockArrivedLocation) {
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

        // GPS filtering
        const MAX_ACCURACY = parseInt(process.env.NEXT_PUBLIC_GPS_MAX_ACCURACY || '50', 10);
        if (!location.simulateAtQvb && fresh.accuracy && fresh.accuracy > MAX_ACCURACY) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('⚠️ GPS accuracy too low:', fresh.accuracy.toFixed(1) + 'm');
          }
          return;
        }

        // Teleportation detection
        if (lastShownRef.current && !location.simulateAtQvb) {
          const distanceFromLast = calculateDistance(
            lastShownRef.current,
            { lat: fresh.lat, lng: fresh.lng }
          );
          const timeDelta = ((fresh.timestamp || 0) - (lastShownRef.current.timestamp || 0)) / 1000;
          const MAX_WALKING_SPEED = parseFloat(process.env.NEXT_PUBLIC_GPS_MAX_WALKING_SPEED || '3.5');

          if (timeDelta > 0 && distanceFromLast / timeDelta > MAX_WALKING_SPEED) {
            if (process.env.NODE_ENV !== 'production') {
              console.warn('⚠️ GPS jump detected');
            }
            return;
          }
        }

        location.setRawLocation(fresh);
        let shown = location.simulateAtQvb ? createMockQvbLocation() : fresh;

        // Derive heading if needed
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

        // Apply heading smoothing
        if (!location.simulateAtQvb && derivedHeading !== null) {
          const currentHeading = lastHeadingRef.current ?? derivedHeading;
          const speed = shown.speed ?? 0;

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
          } else {
            shown = { ...shown, heading: currentHeading };
          }
        } else if (location.simulateAtQvb && derivedHeading !== null) {
          shown = { ...shown, heading: derivedHeading };
          lastHeadingRef.current = derivedHeading;
        }

        // Apply position smoothing
        if (!location.simulateAtQvb && lastShownRef.current) {
          const speed = shown.speed ?? 0;
          const isStationary = speed < SMOOTHING.SPEED_STATIONARY_THRESHOLD;
          const isWalking = speed >= SMOOTHING.SPEED_STATIONARY_THRESHOLD && speed < SMOOTHING.SPEED_WALKING_MAX;

          if (isStationary) {
            shown = {
              ...shown,
              lat: lastShownRef.current.lat + (shown.lat - lastShownRef.current.lat) * SMOOTHING.POSITION_STATIONARY_ALPHA,
              lng: lastShownRef.current.lng + (shown.lng - lastShownRef.current.lng) * SMOOTHING.POSITION_STATIONARY_ALPHA,
            };
          } else if (isWalking) {
            shown = {
              ...shown,
              lat: lastShownRef.current.lat + (shown.lat - lastShownRef.current.lat) * SMOOTHING.POSITION_WALKING_ALPHA,
              lng: lastShownRef.current.lng + (shown.lng - lastShownRef.current.lng) * SMOOTHING.POSITION_WALKING_ALPHA,
            };
          }
        }

        // Apply Kalman filter
        const useKalmanFilter = process.env.NEXT_PUBLIC_USE_KALMAN_FILTER !== 'false';
        if (useKalmanFilter && !location.simulateAtQvb) {
          const kalmanManager = getKalmanFilterManager();
          const filtered = kalmanManager.processGPS(
            shown.lat,
            shown.lng,
            shown.accuracy,
            shown.heading ?? undefined
          );
          shown = {
            ...shown,
            lat: filtered.lat,
            lng: filtered.lng
          };
        }

        lastShownRef.current = { lat: shown.lat, lng: shown.lng, timestamp: shown.timestamp };
        location.setUserLocation(shown);

        // Check if within map bounds
        const here = { lat: shown.lat, lng: shown.lng };
        if (!isWithinMapBounds(here)) {
          map.setShowOutOfArea(true);
        } else {
          map.setShowOutOfArea(false);
          
          // Auto-set start to "My location" if not set
          if (!navigation.navigationStart) {
            const myLocationBusiness: Business = {
              id: 'my-location',
              name: 'My location',
              category: 'Current Position',
              lat: shown.lat,
              lng: shown.lng,
            };
            navigation.setNavigationStart(myLocationBusiness);
          }
        }

        // Update turn-by-turn instruction
        if (navigation.turnByTurnActive && navigation.activeRoute) {
          const graph = (window as any).__SYD_GRAPH__;
          const res = getNextInstruction(navigation.activeRoute, here, graph);
          navigation.updateInstruction(res.text);
          if (res.reachedDestination) {
            navigation.setTurnByTurnActive(false);
          }
        }
        
        // Nav marker calculation will be handled by NavigationEngine component
      },
      parseInt(process.env.NEXT_PUBLIC_GPS_THROTTLE_MS || '1000', 10)
    ),
    [] // CRITICAL: Empty deps - refs are used inside to access latest context values
  );
  
  // Watch GPS position
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      processGPSUpdate,
      (error) => console.error('Geolocation error:', error),
      {
        enableHighAccuracy: true,
        maximumAge: parseInt(process.env.NEXT_PUBLIC_GPS_MAXIMUM_AGE || '5000', 10),
        timeout: 15000
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [processGPSUpdate]);
  
  // This component is invisible - just handles GPS logic
  return null;
}




