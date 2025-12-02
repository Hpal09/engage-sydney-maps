"use client";

import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from '@/contexts/LocationContext';
import { useNavigation } from '@/contexts/NavigationContext';
import { gpsToSvg } from '@/lib/coordinateMapper';
import type { PathNode } from '@/types';

/**
 * PERF-1: Navigation Engine Component
 * Handles nav marker calculation and route progress tracking
 * Extracted from main Page component for separation of concerns
 */

export default function NavigationEngine() {
  const location = useLocation();
  const navigation = useNavigation();
  
  const projectLatLng = useCallback((lat: number, lng: number) => gpsToSvg(lat, lng), []);
  const navMarkerRef = useRef<{ x: number; y: number; angleDeg: number } | null>(null);
  
  // Update nav marker when GPS position changes
  useEffect(() => {
    if (!navigation.activeRoute || navigation.activeRoute.length < 2 || !location.userLocation) {
      if (navMarkerRef.current) {
        navMarkerRef.current = null;
        navigation.resetRoute();
      }
      return;
    }

    const activeRoute = navigation.activeRoute;
    const shown = location.userLocation;
    const effectiveHeading = location.effectiveHeading;

    try {
      // If start point is NOT "my-location", keep marker at route start during turn-by-turn
      if (navigation.turnByTurnActive && navigation.navigationStart && navigation.navigationStart.id !== 'my-location') {
        const startPoint = activeRoute[0];
        const nextPoint = activeRoute[1];

        let angleDeg: number;
        if (typeof shown.heading === 'number' && !Number.isNaN(shown.heading)) {
          angleDeg = shown.heading - 90;
        } else {
          const dx = nextPoint.x - startPoint.x;
          const dy = nextPoint.y - startPoint.y;
          angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
        }

        const marker = { x: startPoint.x, y: startPoint.y, angleDeg };
        navMarkerRef.current = marker;
        navigation.updateGPSPosition({
          navMarker: marker,
          remainingRoute: activeRoute,
          routeProgress: 0,
          isOffRoute: false,
          distanceFromRoute: 0,
        });
        return;
      }

      // Convert user position to SVG
      const userSvgPos = projectLatLng(shown.lat, shown.lng);

      // PERF-3: Optimized segment search with smart window
      const lastBestSegIdx = Math.floor(navigation.routeProgress * (activeRoute.length - 1));
      const searchStart = Math.max(0, lastBestSegIdx - 5);
      const searchEnd = Math.min(activeRoute.length - 1, lastBestSegIdx + 15);

      let bestSegIdx = searchStart;
      let bestDistToSegment = Infinity;

      // Search nearby segments only
      for (let i = searchStart; i < searchEnd; i++) {
        const a = activeRoute[i];
        const b = activeRoute[i + 1];

        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const apx = userSvgPos.x - a.x;
        const apy = userSvgPos.y - a.y;
        const abLen2 = Math.max(1, abx * abx + aby * aby);
        let t = (apx * abx + apy * aby) / abLen2;
        t = Math.max(0, Math.min(1, t));

        const projX = a.x + t * abx;
        const projY = a.y + t * aby;
        const distToSeg = Math.hypot(userSvgPos.x - projX, userSvgPos.y - projY);

        if (distToSeg < bestDistToSegment) {
          bestDistToSegment = distToSeg;
          bestSegIdx = i;
        }
      }

      // Project onto best segment
      const a = activeRoute[bestSegIdx];
      const b = activeRoute[bestSegIdx + 1];

      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const apx = userSvgPos.x - a.x;
      const apy = userSvgPos.y - a.y;
      const abLen2 = Math.max(1, abx * abx + aby * aby);
      let t = (apx * abx + apy * aby) / abLen2;
      t = Math.max(-0.1, Math.min(1.1, t));

      const projX = a.x + t * abx;
      const projY = a.y + t * aby;

      // Calculate angle
      let angleDeg: number;
      const useDeviceHeading = process.env.NEXT_PUBLIC_USE_DEVICE_HEADING_POINTER !== 'false';

      if (useDeviceHeading && effectiveHeading !== null && !Number.isNaN(effectiveHeading)) {
        angleDeg = effectiveHeading - 90;
      } else {
        const angleRad = Math.atan2(aby, abx);
        angleDeg = (angleRad * 180) / Math.PI;
      }

      // Off-route detection
      const OFF_ROUTE_THRESHOLD = 200;
      const distanceInMeters = bestDistToSegment * 0.1;
      let isOffRouteNow = false;
      
      if (navigation.turnByTurnActive) {
        if (distanceInMeters > OFF_ROUTE_THRESHOLD) {
          if (!navigation.isOffRoute) {
            console.warn('⚠️ USER WENT OFF ROUTE!');
          }
          isOffRouteNow = true;
        } else {
          if (navigation.isOffRoute) {
            console.log('✅ User back on route');
          }
          isOffRouteNow = false;
        }
      }

      const newMarker = { x: projX, y: projY, angleDeg };
      navMarkerRef.current = newMarker;

      const remaining = [
        { ...a, x: projX, y: projY },
        ...activeRoute.slice(bestSegIdx + 1)
      ];

      // PERF-3: Batch update
      navigation.updateGPSPosition({
        navMarker: newMarker,
        remainingRoute: remaining,
        routeProgress: bestSegIdx / (activeRoute.length - 1),
        isOffRoute: isOffRouteNow,
        distanceFromRoute: distanceInMeters,
      });

    } catch (err) {
      console.error('Nav marker calculation error:', err);
    }
  }, [
    location.userLocation,
    location.effectiveHeading,
    navigation.activeRoute,
    navigation.turnByTurnActive,
    navigation.navigationStart,
    navigation.routeProgress,
    navigation.isOffRoute,
    navigation,
    projectLatLng
  ]);

  // Invisible component
  return null;
}



