"use client";

import { createContext, useContext, useState, useMemo, ReactNode } from 'react';
import type { DeviceLocation } from '@/types';

/**
 * PERF-1: Location Context
 * Manages GPS tracking, user location, compass, and location-based features
 */

interface LocationContextType {
  // User location
  userLocation: DeviceLocation | undefined;
  setUserLocation: (location: DeviceLocation | undefined) => void;

  rawLocation: DeviceLocation | undefined;
  setRawLocation: (location: DeviceLocation | undefined) => void;

  // Compass
  compassHeading: number | null;
  setCompassHeading: (heading: number | null) => void;

  // Mock/simulation
  simulateAtQvb: boolean;
  setSimulateAtQvb: (simulate: boolean) => void;

  mockArrivedLocation: DeviceLocation | null;
  setMockArrivedLocation: (location: DeviceLocation | null) => void;

  // Effective heading (GPS + compass)
  effectiveHeading: number;
}

const LocationContext = createContext<LocationContextType | null>(null);

export function useLocation() {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocation must be used within LocationProvider');
  }
  return context;
}

interface LocationProviderProps {
  children: ReactNode;
}

export function LocationProvider({ children }: LocationProviderProps) {
  const [userLocation, setUserLocation] = useState<DeviceLocation | undefined>(undefined);
  const [rawLocation, setRawLocation] = useState<DeviceLocation | undefined>(undefined);
  const [compassHeading, setCompassHeading] = useState<number | null>(null);
  const [simulateAtQvb, setSimulateAtQvb] = useState(false);
  const [mockArrivedLocation, setMockArrivedLocation] = useState<DeviceLocation | null>(null);

  // Combine GPS heading with compass heading (GPS preferred, compass as fallback)
  const effectiveHeading = useMemo(() =>
    userLocation?.heading ?? compassHeading ?? 0,
    [userLocation?.heading, compassHeading]
  );

  // CRITICAL FIX: Memoize context value to prevent re-render cascades
  const value: LocationContextType = useMemo(() => ({
    userLocation,
    setUserLocation,
    rawLocation,
    setRawLocation,
    compassHeading,
    setCompassHeading,
    simulateAtQvb,
    setSimulateAtQvb,
    mockArrivedLocation,
    setMockArrivedLocation,
    effectiveHeading,
  }), [
    userLocation,
    rawLocation,
    compassHeading,
    simulateAtQvb,
    mockArrivedLocation,
    effectiveHeading,
  ]);

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}

