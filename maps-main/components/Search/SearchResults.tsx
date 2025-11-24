"use client";

import { MapPin, Star, Plus, Tag as TagIcon, Calendar, Gift, ArrowUpDown } from 'lucide-react';
import type { Business, DeviceLocation } from '@/types';
import type { Deal, Event } from '@/lib/dataService';
import { calculateDistance } from '@/lib/coordinateMapper';
import { formatDistance } from '@/lib/turnByTurn';
import { useMemo, useState } from 'react';

type SortOption = 'distance' | 'relevance' | 'rating';

// Google Maps-style navigation arrow component
function NavigationArrow({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Navigation chevron pointing right */}
      <path
        d="M7 4 L14 10 L7 16 L7 13 L10 10 L7 7 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface Props {
  places: Business[];
  deals: Deal[];
  events: Event[];
  userLocation?: DeviceLocation;
  selectedTab: 'all' | 'places' | 'deals' | 'events' | 'experiences';
  onSelectPlace: (placeId: string) => void;
  onAddToList?: (placeId: string) => void;
}

export default function SearchResults({
  places,
  deals,
  events,
  userLocation,
  selectedTab,
  onSelectPlace,
  onAddToList,
}: Props) {
  const [sortBy, setSortBy] = useState<SortOption>('distance');

  // Calculate distances for places (don't sort here, we'll sort based on sortBy)
  const placesWithDistance = useMemo(() => {
    return places.map(place => ({
      ...place,
      distance: userLocation
        ? calculateDistance(
            { lat: userLocation.lat, lng: userLocation.lng },
            { lat: place.lat, lng: place.lng }
          )
        : undefined,
    }));
  }, [places, userLocation]);

  // Filter results based on selected tab
  const filteredPlaces = useMemo(() => {
    let filtered: typeof placesWithDistance;

    switch (selectedTab) {
      case 'places':
        filtered = placesWithDistance;
        break;
      case 'deals':
        const placeIdsWithDeals = new Set(deals.map(d => d.placeId));
        filtered = placesWithDistance.filter(p => placeIdsWithDeals.has(p.id));
        break;
      case 'events':
        const placeIdsWithEvents = new Set(events.filter(e => e.placeId).map(e => e.placeId!));
        filtered = placesWithDistance.filter(p => placeIdsWithEvents.has(p.id));
        break;
      case 'experiences':
        // TODO: Add experiences filtering
        filtered = placesWithDistance;
        break;
      default:
        filtered = placesWithDistance;
    }

    // Apply sorting
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'distance':
          // Sort by distance (closest first), places without distance go last
          const distA = a.distance ?? Infinity;
          const distB = b.distance ?? Infinity;
          return distA - distB;

        case 'rating':
          // Sort by rating (highest first), places without rating go last
          const ratingA = a.rating ?? 0;
          const ratingB = b.rating ?? 0;
          return ratingB - ratingA;

        case 'relevance':
          // Relevance: prioritize places with deals/events, then by rating, then by distance
          const aHasDeals = deals.some(d => d.placeId === a.id && d.isLive);
          const bHasDeals = deals.some(d => d.placeId === b.id && d.isLive);
          const aHasEvents = events.some(e => e.placeId === a.id && e.isLive);
          const bHasEvents = events.some(e => e.placeId === b.id && e.isLive);

          // Score: deals (2 points) + events (1 point)
          const aScore = (aHasDeals ? 2 : 0) + (aHasEvents ? 1 : 0);
          const bScore = (bHasDeals ? 2 : 0) + (bHasEvents ? 1 : 0);

          if (aScore !== bScore) return bScore - aScore;

          // Then by rating
          const rA = a.rating ?? 0;
          const rB = b.rating ?? 0;
          if (rA !== rB) return rB - rA;

          // Finally by distance
          const dA = a.distance ?? Infinity;
          const dB = b.distance ?? Infinity;
          return dA - dB;

        default:
          return 0;
      }
    });
  }, [selectedTab, placesWithDistance, deals, events, sortBy]);

  const getDealsForPlace = (placeId: string) => {
    return deals.filter(d => d.placeId === placeId && d.isLive);
  };

  const getEventsForPlace = (placeId: string) => {
    return events.filter(e => e.placeId === placeId && e.isLive);
  };

  if (filteredPlaces.length === 0) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 p-10 text-center">
        <div className="bg-white rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4 shadow-sm">
          <MapPin className="h-8 w-8 text-gray-300" />
        </div>
        <p className="text-gray-600 font-semibold text-sm">No results found</p>
        <p className="text-gray-400 text-xs mt-1">Try adjusting your search or filters</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="px-2 pb-3 flex items-center justify-between">
        <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
          Results ({filteredPlaces.length})
        </span>
        <div className="relative">
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-gray-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl px-3 py-1.5 pr-7 outline-none cursor-pointer hover:border-blue-400 hover:bg-blue-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all appearance-none"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236B7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
                backgroundSize: '14px',
              }}
            >
              <option value="distance">Distance</option>
              <option value="relevance">Relevance</option>
              <option value="rating">Rating</option>
            </select>
          </div>
        </div>
      </div>

      {filteredPlaces.map((place) => {
        const placeDeals = getDealsForPlace(place.id);
        const placeEvents = getEventsForPlace(place.id);
        const hasDeals = placeDeals.length > 0;
        const hasEvents = placeEvents.length > 0;

        return (
          <div
            key={place.id}
            className="rounded-2xl bg-white border border-gray-200 hover:border-blue-400 hover:shadow-lg transition-all duration-200 p-4 cursor-pointer group"
            onClick={() => onSelectPlace(place.id)}
          >
            <div className="flex items-start gap-4">
              {/* Place Icon */}
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
                <MapPin className="h-6 w-6 text-white" />
              </div>

              {/* Place Info */}
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                  {place.name}
                </h3>

                <div className="flex items-center gap-2 mt-1.5">
                  <div className="text-xs text-gray-600 flex items-center gap-1 font-medium">
                    <TagIcon className="h-3 w-3" />
                    {place.category}
                  </div>

                  {place.rating && (
                    <div className="text-xs text-gray-600 flex items-center gap-1 font-medium">
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                      {place.rating}
                    </div>
                  )}

                  {typeof place.distance === 'number' && (
                    <div className="text-xs text-gray-500 font-medium">
                      • {formatDistance(place.distance)}
                    </div>
                  )}
                </div>

                {/* Deals and Events Tags */}
                {(hasDeals || hasEvents) && (
                  <div className="flex items-center gap-2 mt-2">
                    {hasDeals && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-medium">
                        <Gift className="h-3 w-3" />
                        {placeDeals.length} {placeDeals.length === 1 ? 'Deal' : 'Deals'}
                      </span>
                    )}
                    {hasEvents && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
                        <Calendar className="h-3 w-3" />
                        {placeEvents.length} {placeEvents.length === 1 ? 'Event' : 'Events'}
                      </span>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPlace(place.id);
                    }}
                    className="flex-1 text-center px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-semibold hover:from-blue-700 hover:to-blue-800 transition-all shadow-md hover:shadow-lg"
                  >
                    View on Map
                  </button>

                  {onAddToList && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddToList(place.id);
                      }}
                      className="p-2.5 rounded-xl border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all group"
                      aria-label="Add to list"
                    >
                      <Plus className="h-5 w-5 text-gray-500 group-hover:text-blue-600 transition-colors" />
                    </button>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPlace(place.id);
                    }}
                    className="p-2.5 rounded-xl border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all group"
                    aria-label="Navigate"
                  >
                    <NavigationArrow className="h-5 w-5 text-gray-500 group-hover:text-blue-600 transition-colors" />
                  </button>
                </div>
              </div>
            </div>

            {/* Show first deal/event if available */}
            {hasDeals && placeDeals[0] && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-start gap-2">
                  <Gift className="h-4 w-4 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 line-clamp-1">
                      {placeDeals[0].title}
                    </p>
                    {placeDeals[0].description && (
                      <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">
                        {placeDeals[0].description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {hasEvents && placeEvents[0] && !hasDeals && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 text-purple-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 line-clamp-1">
                      {placeEvents[0].title}
                    </p>
                    {placeEvents[0].description && (
                      <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">
                        {placeEvents[0].description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
