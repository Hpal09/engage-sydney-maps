import { useMemo } from 'react';
import type { Business, DeviceLocation } from '@/types';
import type { Deal, Event } from '@/lib/dataService';
import { calculateDistance } from '@/lib/coordinateMapper';

interface UseFilteredPlacesOptions {
  allPlaces: Business[];
  allDeals: Deal[];
  allEvents: Event[];
  debouncedKeyword: string;
  selectedCategory: string;
  activeTabs: Set<'deals' | 'events' | 'experiences'>;
  nearMeOnly: boolean;
  userLocation?: DeviceLocation;
}

/**
 * Custom hook to filter places based on search criteria
 * Optimized with useMemo to prevent unnecessary recalculations
 */
export function useFilteredPlaces({
  allPlaces,
  allDeals,
  allEvents,
  debouncedKeyword,
  selectedCategory,
  activeTabs,
  nearMeOnly,
  userLocation,
}: UseFilteredPlacesOptions) {
  
  // Memoize deals/events by place ID maps (only recalculate when data changes)
  const dealsByPlaceId = useMemo(() => {
    const now = new Date();
    const map = new Map<string, Deal[]>();

    allDeals.forEach(deal => {
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
      if (event.isLive && event.placeId && new Date(event.endsAt) >= now) {
        const events = map.get(event.placeId) || [];
        events.push(event);
        map.set(event.placeId, events);
      }
    });

    return map;
  }, [allEvents]);

  // Main filtering logic - optimized with useMemo
  const filteredPlaces = useMemo(() => {
    let result = [...allPlaces];

    // Keyword filter (simple, case-insensitive) - uses debounced keyword
    if (debouncedKeyword.trim()) {
      const q = debouncedKeyword.toLowerCase();
      result = result.filter(place =>
        place.name.toLowerCase().includes(q) ||
        (place.category?.toLowerCase().includes(q))
      );
    }

    // Category filter - exact match
    if (selectedCategory !== "All categories") {
      result = result.filter(place => place.category === selectedCategory);
    }

    // Tab filter - multi-select toggle tabs (Deals, Events, Experiences)
    if (activeTabs.size > 0) {
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

    return result;
  }, [allPlaces, allDeals, allEvents, debouncedKeyword, selectedCategory, activeTabs, nearMeOnly, userLocation]);

  return {
    filteredPlaces,
    dealsByPlaceId,
    eventsByPlaceId,
  };
}

