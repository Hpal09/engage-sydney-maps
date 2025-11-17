"use client";

import { useState } from 'react';
import type { Business } from '@/types';
import type { DeviceLocation } from '@/types';
import type { PathfindingDiagnostics } from '@/lib/pathfinding';
import { calculateDistance } from '@/lib/coordinateMapper';

interface MapDebugOverlayProps {
  userLocation?: DeviceLocation;
  rawLocation?: DeviceLocation;
  navigationStart: Business | null;
  navigationDestination: Business | null;
  isOffRoute: boolean;
  distanceFromRoute: number;
  activeRoute: any[] | null;
  compassHeading: number | null;
  smoothedHeading?: number;
  showGraphOverlay?: boolean;
  onToggleGraphOverlay?: () => void;
  pathfindingDiag?: PathfindingDiagnostics | null;
}

export default function MapDebugOverlay({
  userLocation,
  rawLocation,
  navigationStart,
  navigationDestination,
  isOffRoute,
  distanceFromRoute,
  activeRoute,
  compassHeading,
  smoothedHeading,
  showGraphOverlay = false,
  onToggleGraphOverlay,
  pathfindingDiag,
}: MapDebugOverlayProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  // Calculate distances to start/destination
  const distToStart = userLocation && navigationStart
    ? calculateDistance(
        { lat: userLocation.lat, lng: userLocation.lng },
        { lat: navigationStart.lat, lng: navigationStart.lng }
      )
    : null;

  const distToDestination = userLocation && navigationDestination
    ? calculateDistance(
        { lat: userLocation.lat, lng: userLocation.lng },
        { lat: navigationDestination.lat, lng: navigationDestination.lng }
      )
    : null;

  return (
    <div className="fixed bottom-4 left-4 z-50 pointer-events-auto">
      <div className="bg-black/80 text-white text-xs font-mono rounded-lg shadow-lg border border-gray-600 max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-600 bg-gray-900/50">
          <span className="font-semibold text-green-400">🔍 MAP DEBUG</span>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            {isCollapsed ? '▼' : '▲'}
          </button>
        </div>

        {!isCollapsed && (
          <div className="p-3 space-y-2">
            {/* GPS Section */}
            <div>
              <div className="text-yellow-400 font-semibold mb-1">GPS Data:</div>
              {rawLocation ? (
                <>
                  <div>Raw: {rawLocation.lat.toFixed(6)}, {rawLocation.lng.toFixed(6)}</div>
                  {rawLocation.accuracy && <div>Accuracy: ±{rawLocation.accuracy.toFixed(1)}m</div>}
                  {rawLocation.speed !== null && <div>Speed: {(rawLocation.speed || 0).toFixed(2)} m/s</div>}
                </>
              ) : (
                <div className="text-gray-500">No GPS data</div>
              )}
            </div>

            {/* Smoothed Position */}
            {userLocation && (
              <div>
                <div className="text-yellow-400 font-semibold mb-1">Smoothed Position:</div>
                <div>Lat: {userLocation.lat.toFixed(6)}</div>
                <div>Lng: {userLocation.lng.toFixed(6)}</div>
              </div>
            )}

            {/* Heading Section */}
            <div>
              <div className="text-yellow-400 font-semibold mb-1">Heading:</div>
              {compassHeading !== null ? (
                <>
                  <div>Compass: {compassHeading.toFixed(1)}°</div>
                  {smoothedHeading !== undefined && <div>Smoothed: {smoothedHeading.toFixed(1)}°</div>}
                  {userLocation?.heading !== null && userLocation?.heading !== undefined && (
                    <div>GPS Heading: {userLocation.heading.toFixed(1)}°</div>
                  )}
                </>
              ) : userLocation?.heading !== null && userLocation?.heading !== undefined ? (
                <div>GPS Only: {userLocation.heading.toFixed(1)}°</div>
              ) : (
                <div className="text-gray-500">No heading data</div>
              )}
            </div>

            {/* Navigation Section */}
            {activeRoute && activeRoute.length > 0 && (
              <div>
                <div className="text-yellow-400 font-semibold mb-1">Navigation:</div>
                <div>Route nodes: {activeRoute.length}</div>
                {distToStart !== null && <div>To start: {distToStart.toFixed(1)}m</div>}
                {distToDestination !== null && <div>To dest: {distToDestination.toFixed(1)}m</div>}
                <div className={isOffRoute ? 'text-red-400' : 'text-green-400'}>
                  Status: {isOffRoute ? '❌ OFF ROUTE' : '✅ On route'}
                </div>
                {isOffRoute && <div>Distance from route: {distanceFromRoute.toFixed(1)}m</div>}
              </div>
            )}

            {/* Pathfinding Diagnostics */}
            {pathfindingDiag && (
              <div className="pt-2 border-t border-gray-700">
                <div className="text-yellow-400 font-semibold mb-1">Pathfinding:</div>
                <div className={pathfindingDiag.algorithm === 'failed' ? 'text-red-400' : 'text-green-400'}>
                  Algorithm: {pathfindingDiag.algorithm.toUpperCase()}
                </div>
                {pathfindingDiag.startNode && (
                  <div className="text-xs">
                    <div>Start node: {pathfindingDiag.startNode.id}</div>
                    <div>  Distance: {pathfindingDiag.startDistance.toFixed(1)} SVG units</div>
                  </div>
                )}
                {pathfindingDiag.endNode && (
                  <div className="text-xs">
                    <div>End node: {pathfindingDiag.endNode.id}</div>
                    <div>  Distance: {pathfindingDiag.endDistance.toFixed(1)} SVG units</div>
                  </div>
                )}
                {pathfindingDiag.algorithm === 'failed' && (
                  <div className="text-red-400 text-xs mt-1">
                    ❌ No route found - locations may be outside walkable area
                  </div>
                )}
              </div>
            )}

            {/* Graph Overlay Toggle */}
            {onToggleGraphOverlay && (
              <div className="pt-2 border-t border-gray-700">
                <button
                  onClick={onToggleGraphOverlay}
                  className={`w-full px-3 py-2 rounded text-xs font-semibold transition-colors ${
                    showGraphOverlay
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  {showGraphOverlay ? '✅ Hide Graph Overlay' : '⚪ Show Graph Overlay'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
