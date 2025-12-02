"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { Business, DeviceLocation, ZoomConfig } from '@/types';

/**
 * PERF-1: Map Context
 * Manages map display state: zoom, rotation, selection, modals, overlays
 */

interface MapContextType {
  // Selected business/POI
  selected: Business | null;
  setSelected: (business: Business | null) => void;
  
  // Map control state
  centerOnUserTick: number;
  setCenterOnUserTick: (tick: number | ((prev: number) => number)) => void;
  
  centerOnPoint: { lat: number; lng: number; tick: number; targetScale?: number } | null;
  setCenterOnPoint: (point: { lat: number; lng: number; tick: number; targetScale?: number } | null) => void;
  
  mapRotation: number;
  setMapRotation: (rotation: number) => void;
  
  zoomConfig: ZoomConfig | null;
  setZoomConfig: (config: ZoomConfig | null) => void;
  
  // Modals
  showLocationModal: boolean;
  setShowLocationModal: (show: boolean) => void;
  
  showOutOfArea: boolean;
  setShowOutOfArea: (show: boolean) => void;
  
  showArrivalMessage: boolean;
  setShowArrivalMessage: (show: boolean) => void;
  
  // Debug/overlay
  showGraphOverlay: boolean;
  setShowGraphOverlay: (show: boolean) => void;
  
  debugTransformLogTick: number;
  setDebugTransformLogTick: (tick: number) => void;
  
  // Accessibility
  accessibilityMode: boolean;
  setAccessibilityMode: (enabled: boolean) => void;
  
  // Indoor map SVG content
  currentFloorSvgContent: string;
  setCurrentFloorSvgContent: (content: string) => void;
  
  allFloorSvgContent: Map<string, string>;
  setAllFloorSvgContent: (content: Map<string, string>) => void;
}

const MapContext = createContext<MapContextType | null>(null);

export function useMap() {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error('useMap must be used within MapProvider');
  }
  return context;
}

interface MapProviderProps {
  children: ReactNode;
}

export function MapProvider({ children }: MapProviderProps) {
  // Selection state
  const [selected, setSelected] = useState<Business | null>(null);
  
  // Map control state
  const [centerOnUserTick, setCenterOnUserTick] = useState(0);
  const [centerOnPoint, setCenterOnPoint] = useState<{ lat: number; lng: number; tick: number; targetScale?: number } | null>(null);
  const [mapRotation, setMapRotation] = useState(0);
  const [zoomConfig, setZoomConfig] = useState<ZoomConfig | null>(null);
  
  // Modal state
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showOutOfArea, setShowOutOfArea] = useState(false);
  const [showArrivalMessage, setShowArrivalMessage] = useState(false);
  
  // Debug state
  const [showGraphOverlay, setShowGraphOverlay] = useState(false);
  const [debugTransformLogTick, setDebugTransformLogTick] = useState(0);
  
  // Accessibility
  const [accessibilityMode, setAccessibilityMode] = useState(false);
  
  // Indoor map SVG
  const [currentFloorSvgContent, setCurrentFloorSvgContent] = useState('');
  const [allFloorSvgContent, setAllFloorSvgContent] = useState<Map<string, string>>(new Map());
  
  const value: MapContextType = {
    selected,
    setSelected,
    centerOnUserTick,
    setCenterOnUserTick,
    centerOnPoint,
    setCenterOnPoint,
    mapRotation,
    setMapRotation,
    zoomConfig,
    setZoomConfig,
    showLocationModal,
    setShowLocationModal,
    showOutOfArea,
    setShowOutOfArea,
    showArrivalMessage,
    setShowArrivalMessage,
    showGraphOverlay,
    setShowGraphOverlay,
    debugTransformLogTick,
    setDebugTransformLogTick,
    accessibilityMode,
    setAccessibilityMode,
    currentFloorSvgContent,
    setCurrentFloorSvgContent,
    allFloorSvgContent,
    setAllFloorSvgContent,
  };
  
  return (
    <MapContext.Provider value={value}>
      {children}
    </MapContext.Provider>
  );
}

