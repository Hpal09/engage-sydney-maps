"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Business, DeviceLocation } from '@/types';
import { ArrowUpDown, Navigation, Clock, ChevronUp } from 'lucide-react';
import { calculateDistance } from '@/lib/coordinateMapper';
import { formatDistance, calculateETA } from '@/lib/turnByTurn';
import PredictiveSearch from '@/components/Search/PredictiveSearch';

interface Waypoint {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

interface Props {
  businesses: Business[];
  userLocation?: DeviceLocation;
  defaultDestination?: Business | null;
  externalStart?: Business | null;
  externalDestination?: Business | null;
  onStartJourney: (start: Waypoint, destination: Waypoint) => void;
  onClearNavigation?: () => void;
  title?: string;
  onSelectMyLocation?: () => void;
  onSelectStartPoint?: (point: Waypoint) => void;
  onStartTurnByTurn?: (start: Waypoint, destination: Waypoint) => void;
}

export default function NavigationPanel({ businesses, userLocation, defaultDestination, externalStart, externalDestination, onStartJourney, onClearNavigation, title = 'Engage ByDisrupt', onSelectMyLocation, onSelectStartPoint, onStartTurnByTurn }: Props) {
  const options: Waypoint[] = useMemo(() => {
    const list: Waypoint[] = [];
    if (userLocation) {
      list.push({ id: 'my-location', label: 'My location', lat: userLocation.lat, lng: userLocation.lng });
    }
    for (const b of businesses) {
      list.push({ id: b.id, label: b.name, lat: b.lat, lng: b.lng });
    }
    return list;
  }, [businesses, userLocation]);

  const [startId, setStartId] = useState<string>(userLocation ? 'my-location' : '');
  const [destId, setDestId] = useState<string>(defaultDestination?.id ?? '');

  useEffect(() => {
    if (defaultDestination?.id) setDestId(defaultDestination.id);
  }, [defaultDestination?.id]);

  // Update internal state when external values change
  useEffect(() => {
    if (externalStart?.id && externalStart.id !== startId) {
      setStartId(externalStart.id);
    }
  }, [externalStart?.id, startId]);

  useEffect(() => {
    if (externalDestination?.id && externalDestination.id !== destId) {
      setDestId(externalDestination.id);
    }
  }, [externalDestination?.id, destId]);

  const start = options.find((o) => o.id === startId);
  const dest = options.find((o) => o.id === destId);

  // Calculate distance and ETA when both points are selected
  const distanceMeters = useMemo(() => {
    if (!start || !dest) return null;
    return calculateDistance(
      { lat: start.lat, lng: start.lng },
      { lat: dest.lat, lng: dest.lng }
    );
  }, [start, dest]);

  // Auto-start route when both points are selected
  useEffect(() => {
    if (start && dest) {
      onStartJourney(start, dest);
    }
  }, [startId, destId, start, dest, onStartJourney]);

  // If user picks My location as start, trigger recenter callback
  useEffect(() => {
    if (startId === 'my-location') {
      onSelectMyLocation?.();
    } else if (startId && start) {
      onSelectStartPoint?.(start);
    }
  }, [startId, start, onSelectMyLocation, onSelectStartPoint]);

  // Collapsible panel state
  const [open, setOpen] = useState<boolean>(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number>(0);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    // Measure content each time open changes or dependencies likely affecting size change
    const measure = () => setContentHeight(el.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, startId, destId, options.length]);

  const summaryText = useMemo(() => {
    const startLabel = start?.label ?? 'Start';
    const destLabel = dest?.label ?? 'Destination';
    const trip = distanceMeters !== null ? `${formatDistance(distanceMeters)} • ${calculateETA(distanceMeters)}` : undefined;
    return { startLabel, destLabel, trip };
  }, [start?.label, dest?.label, distanceMeters]);

  // Derive simple area name from user location using nearby landmarks/areas
  const areaName = useMemo(() => {
    if (!userLocation) return undefined;
    const areas = [
      { name: 'Haymarket', lat: -33.8793, lng: 151.2049, radiusM: 400 },
      { name: 'Chinatown', lat: -33.8788, lng: 151.2045, radiusM: 350 },
      { name: 'Darling Square', lat: -33.8755, lng: 151.2020, radiusM: 450 },
      { name: 'QVB', lat: -33.8718, lng: 151.2067, radiusM: 350 },
      { name: 'Sydney CBD', lat: -33.8695, lng: 151.2094, radiusM: 1200 },
    ];
    let best: { name: string; dist: number } | null = null;
    for (const a of areas) {
      const d = calculateDistance(
        { lat: userLocation.lat, lng: userLocation.lng },
        { lat: a.lat, lng: a.lng }
      );
      if (d <= a.radiusM) {
        if (!best || d < best.dist) best = { name: a.name, dist: d };
      }
    }
    return best?.name;
  }, [userLocation?.lat, userLocation?.lng]);

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 mx-auto w-full max-w-xl p-4">
      <div className="rounded-3xl border bg-white/95 shadow-xl">
        {/* Header / Handle */}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="w-full rounded-t-3xl p-3 pb-2"
        >
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-gray-300" />
          <div className="flex items-center justify-between px-1">
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 truncate text-sm font-medium text-gray-900">
                {areaName ?? title}
                {summaryText.trip && <span className="ml-2 text-xs font-normal text-gray-500">{summaryText.trip}</span>}
              </div>
            </div>
            <div className={`size-6 shrink-0 rounded-full bg-white shadow ring-1 ring-gray-200 flex items-center justify-center transition-transform duration-300 ease-in-out ${open ? 'rotate-180' : ''}`}>
              <ChevronUp className="h-4 w-4 text-gray-700" />
            </div>
          </div>
        </button>

        {/* Animated body */}
        <div
          className="overflow-hidden transition-[height] duration-300 ease-in-out will-change-[height]"
          style={{ height: open ? contentHeight : 0 }}
        >
          <div
            ref={contentRef}
            className={`p-4 pt-0 transition-opacity transition-transform duration-300 ease-in-out ${open ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'}`}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="rounded-full border px-4 py-1 text-sm font-medium shadow-sm">{title}</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Swap start and destination"
                  onClick={() => { if (startId && destId) { const s = startId; setStartId(destId); setDestId(s); } }}
                  className="rounded-full bg-white p-2 shadow"
                >
                  <ArrowUpDown className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
          <PredictiveSearch
            options={options}
            value={startId}
            onChange={setStartId}
            placeholder="Search for start location..."
            label="Start point"
          />

          <PredictiveSearch
            options={options.filter((o) => o.id !== startId)}
            value={destId}
            onChange={setDestId}
            placeholder="Search for destination..."
            label="Destination"
          />

          {/* Distance and ETA Display */}
          {distanceMeters !== null && start && dest && (
            <div className="rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-blue-600 p-2">
                    <Navigation className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 font-medium mb-0.5">Trip Details</div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-gray-900">
                        {formatDistance(distanceMeters)}
                      </span>
                      <span className="text-gray-400">•</span>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-blue-600" />
                        <span className="text-lg font-semibold text-blue-600">
                          {calculateETA(distanceMeters)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-1 flex gap-3">
            <button
              disabled={!start || !dest}
              onClick={() => start && dest && onStartJourney(start, dest)}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-base font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50"
            >
              <Navigation className="h-5 w-5" />
              Start journey
            </button>
            {onStartTurnByTurn && (
              <button
                disabled={!start || !dest}
                onClick={() => start && dest && onStartTurnByTurn(start, dest)}
                className="px-5 py-3 rounded-2xl bg-green-600 text-white font-semibold shadow hover:bg-green-700 disabled:opacity-50"
              >
                Start
              </button>
            )}
            {(startId || destId) && onClearNavigation && (
              <button
                onClick={onClearNavigation}
                className="px-4 py-3 rounded-2xl border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              >
                Clear
              </button>
            )}
          </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


