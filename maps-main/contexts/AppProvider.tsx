"use client";

import { ReactNode, useState, useEffect, useMemo } from 'react';
import { SearchProvider } from './SearchContext';
import { NavigationProvider } from './NavigationContext';
import { MapProvider } from './MapContext';
import { LocationProvider } from './LocationContext';
import type { Business } from '@/types';
import type { Deal, Event } from '@/lib/dataService';
import { normalizeLatitude, normalizeLongitude } from '@/lib/coordinateMapper';

/**
 * PERF-1: Master App Provider
 * Wraps the entire app with all context providers in correct order
 * Handles initial data loading (places, deals, events)
 */

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  // Core data state (stays at root level for now)
  const [allPlaces, setAllPlaces] = useState<Business[]>([]);
  const [allDeals, setAllDeals] = useState<Deal[]>([]);
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  
  // Load initial data on mount
  useEffect(() => {
    (async () => {
      try {
        const [placesRes, dealsRes, eventsRes] = await Promise.all([
          fetch('/api/places').then(r => r.json()),
          fetch('/api/deals').then(r => r.json()),
          fetch('/api/events').then(r => r.json()),
        ]);

        // Validate and normalize places
        if (Array.isArray(placesRes)) {
          const rawPlaces = placesRes as Business[];
          const normalizedPlaces = rawPlaces.map((place) => ({
            ...place,
            lat: normalizeLatitude(place.lat),
            lng: normalizeLongitude(place.lng),
          }));
          setAllPlaces(normalizedPlaces);
        } else {
          console.error('❌ Failed to load places from API:', placesRes);
          setAllPlaces([]);
        }

        setAllDeals(Array.isArray(dealsRes) ? dealsRes as Deal[] : []);
        setAllEvents(Array.isArray(eventsRes) ? eventsRes as Event[] : []);
        
        setDataLoaded(true);
        
        console.log('📊 Data loaded:', {
          places: Array.isArray(placesRes) ? placesRes.length : 0,
          deals: Array.isArray(dealsRes) ? dealsRes.length : 0,
          events: Array.isArray(eventsRes) ? eventsRes.length : 0,
        });
      } catch (error) {
        console.error('Error loading initial data:', error);
        setDataLoaded(true); // Still mark as loaded to show UI
      }
    })();
  }, []);
  
  // Calculate upcoming events count (memoized to prevent recalculation on every render)
  const upcomingEventsCount = useMemo(() => {
    const now = new Date();
    return allEvents.filter(event => event.isLive && new Date(event.endsAt) >= now).length;
  }, [allEvents]);
  
  // Nested providers - order matters!
  // LocationProvider must be outermost (others depend on it)
  return (
    <LocationProvider>
      <MapProvider>
        <NavigationProvider userLocation={undefined}>
          <SearchProviderWithLocation
            allPlaces={allPlaces}
            allDeals={allDeals}
            allEvents={allEvents}
            upcomingEventsCount={upcomingEventsCount}
          >
            {children}
          </SearchProviderWithLocation>
        </NavigationProvider>
      </MapProvider>
    </LocationProvider>
  );
}

// Wrapper to inject location into SearchProvider
function SearchProviderWithLocation({ 
  children, 
  allPlaces, 
  allDeals, 
  allEvents,
  upcomingEventsCount,
}: {
  children: ReactNode;
  allPlaces: Business[];
  allDeals: Deal[];
  allEvents: Event[];
  upcomingEventsCount: number;
}) {
  // This is a temporary workaround - we'll need to refactor SearchProvider
  // to access location via useLocation() hook instead of props
  return (
    <SearchProvider
      allPlaces={allPlaces}
      allDeals={allDeals}
      allEvents={allEvents}
      userLocation={undefined}
      upcomingEventsCount={upcomingEventsCount}
    >
      {children}
    </SearchProvider>
  );
}

