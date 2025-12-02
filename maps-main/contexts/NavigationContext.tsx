"use client";

import { createContext, useContext, useState, useMemo, useCallback, ReactNode } from 'react';
import type { Business, PathNode, PathGraph, DeviceLocation } from '@/types';
import type { PathfindingDiagnostics } from '@/lib/pathfinding';
import { useNavigationState } from '@/hooks/useNavigationState';

/**
 * PERF-1: Navigation Context
 * Manages navigation state: routes, waypoints, turn-by-turn, indoor navigation
 */

interface NavigationContextType {
  // Outdoor navigation
  navigationStart: Business | null;
  setNavigationStart: (start: Business | null) => void;
  navigationDestination: Business | null;
  setNavigationDestination: (dest: Business | null) => void;
  
  navigationActive: boolean;
  setNavigationActive: (active: boolean) => void;
  
  activeRoute: PathNode[] | null;
  setActiveRoute: (route: PathNode[] | null) => void;
  
  turnByTurnActive: boolean;
  setTurnByTurnActive: (active: boolean) => void;
  
  pathGraph: PathGraph | null;
  setPathGraph: (graph: PathGraph | null) => void;
  
  // From reducer (PERF-3)
  navMarker: { x: number; y: number; angleDeg: number } | null;
  remainingRoute: PathNode[] | null;
  routeProgress: number;
  isOffRoute: boolean;
  distanceFromRoute: number;
  currentInstruction: string;
  
  // Navigation actions
  updateGPSPosition: (payload: any) => void;
  updateInstruction: (instruction: string) => void;
  clearNavigation: () => void;
  resetRoute: () => void;
  
  // Navigation errors
  showNavigationError: boolean;
  setShowNavigationError: (show: boolean) => void;
  navigationErrorMessage: string;
  setNavigationErrorMessage: (message: string) => void;
  
  // Indoor navigation
  indoorModeActive: boolean;
  setIndoorModeActive: (active: boolean) => void;
  selectedFloorId: string | null;
  setSelectedFloorId: (floorId: string | null) => void;
  buildingData: any;
  setBuildingData: (data: any) => void;
  selectedIndoorPOI: any;
  setSelectedIndoorPOI: (poi: any) => void;
  indoorNavigationStart: any;
  setIndoorNavigationStart: (start: any) => void;
  indoorNavigationDestination: any;
  setIndoorNavigationDestination: (dest: any) => void;
  indoorRoute: Array<{x: number; y: number; floorId?: string}> | null;
  setIndoorRoute: (route: Array<{x: number; y: number; floorId?: string}> | null) => void;
  
  // Hybrid navigation
  buildingEntrances: any[];
  setBuildingEntrances: (entrances: any[]) => void;
  hybridRouteActive: boolean;
  setHybridRouteActive: (active: boolean) => void;
  hybridGraph: Map<string, any> | null;
  setHybridGraph: (graph: Map<string, any> | null) => void;
  
  // Debug
  pathfindingDiag: PathfindingDiagnostics | null;
  setPathfindingDiag: (diag: PathfindingDiagnostics | null) => void;

  // Accessibility
  accessibilityMode: boolean;
  setAccessibilityMode: (enabled: boolean) => void;

  // Helper function
  clearAllNavigation: () => void;
}

const NavigationContext = createContext<NavigationContextType | null>(null);

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider');
  }
  return context;
}

interface NavigationProviderProps {
  children: ReactNode;
  userLocation?: DeviceLocation;
}

export function NavigationProvider({ children, userLocation }: NavigationProviderProps) {
  // Outdoor navigation state
  const [navigationStart, setNavigationStart] = useState<Business | null>(null);
  const [navigationDestination, setNavigationDestination] = useState<Business | null>(null);
  const [navigationActive, setNavigationActive] = useState(false);
  const [activeRoute, setActiveRoute] = useState<PathNode[] | null>(null);
  const [turnByTurnActive, setTurnByTurnActive] = useState(false);
  const [pathGraph, setPathGraph] = useState<PathGraph | null>(null);
  
  // Navigation errors
  const [showNavigationError, setShowNavigationError] = useState(false);
  const [navigationErrorMessage, setNavigationErrorMessage] = useState('');
  
  // Indoor navigation state
  const [indoorModeActive, setIndoorModeActive] = useState(false);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [buildingData, setBuildingData] = useState<any>(null);
  const [selectedIndoorPOI, setSelectedIndoorPOI] = useState<any>(null);
  const [indoorNavigationStart, setIndoorNavigationStart] = useState<any>(null);
  const [indoorNavigationDestination, setIndoorNavigationDestination] = useState<any>(null);
  const [indoorRoute, setIndoorRoute] = useState<Array<{x: number; y: number; floorId?: string}> | null>(null);
  
  // Hybrid navigation state
  const [buildingEntrances, setBuildingEntrances] = useState<any[]>([]);
  const [hybridRouteActive, setHybridRouteActive] = useState(false);
  const [hybridGraph, setHybridGraph] = useState<Map<string, any> | null>(null);
  
  // Debug
  const [pathfindingDiag, setPathfindingDiag] = useState<PathfindingDiagnostics | null>(null);

  // Accessibility
  const [accessibilityMode, setAccessibilityMode] = useState(false);

  // PERF-3: Navigation reducer for batched updates
  const { state: navState, actions: navActions } = useNavigationState();
  
  // Clear all navigation helper
  const clearAllNavigation = useCallback(() => {
    setNavigationStart(null);
    setNavigationDestination(null);
    setActiveRoute(null);
    setNavigationActive(false);
    setTurnByTurnActive(false);
    setShowNavigationError(false);
    navActions.clearNavigation();
  }, [navActions]);

  // CRITICAL FIX: Memoize context value to prevent re-render cascades
  const value: NavigationContextType = useMemo(() => ({
    navigationStart,
    setNavigationStart,
    navigationDestination,
    setNavigationDestination,
    navigationActive,
    setNavigationActive,
    activeRoute,
    setActiveRoute,
    turnByTurnActive,
    setTurnByTurnActive,
    pathGraph,
    setPathGraph,

    // From reducer
    navMarker: navState.navMarker,
    remainingRoute: navState.remainingRoute,
    routeProgress: navState.routeProgress,
    isOffRoute: navState.isOffRoute,
    distanceFromRoute: navState.distanceFromRoute,
    currentInstruction: navState.currentInstruction,

    updateGPSPosition: navActions.updateGPSPosition,
    updateInstruction: navActions.updateInstruction,
    clearNavigation: navActions.clearNavigation,
    resetRoute: navActions.resetRoute,

    showNavigationError,
    setShowNavigationError,
    navigationErrorMessage,
    setNavigationErrorMessage,

    indoorModeActive,
    setIndoorModeActive,
    selectedFloorId,
    setSelectedFloorId,
    buildingData,
    setBuildingData,
    selectedIndoorPOI,
    setSelectedIndoorPOI,
    indoorNavigationStart,
    setIndoorNavigationStart,
    indoorNavigationDestination,
    setIndoorNavigationDestination,
    indoorRoute,
    setIndoorRoute,

    buildingEntrances,
    setBuildingEntrances,
    hybridRouteActive,
    setHybridRouteActive,
    hybridGraph,
    setHybridGraph,

    pathfindingDiag,
    setPathfindingDiag,

    accessibilityMode,
    setAccessibilityMode,

    clearAllNavigation,
  }), [
    navigationStart,
    navigationDestination,
    navigationActive,
    activeRoute,
    turnByTurnActive,
    pathGraph,
    navState.navMarker,
    navState.remainingRoute,
    navState.routeProgress,
    navState.isOffRoute,
    navState.distanceFromRoute,
    navState.currentInstruction,
    navActions.updateGPSPosition,
    navActions.updateInstruction,
    navActions.clearNavigation,
    navActions.resetRoute,
    showNavigationError,
    navigationErrorMessage,
    indoorModeActive,
    selectedFloorId,
    buildingData,
    selectedIndoorPOI,
    indoorNavigationStart,
    indoorNavigationDestination,
    indoorRoute,
    buildingEntrances,
    hybridRouteActive,
    hybridGraph,
    pathfindingDiag,
    accessibilityMode,
    clearAllNavigation,
  ]);

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

