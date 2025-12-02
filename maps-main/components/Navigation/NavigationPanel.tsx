"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Business, DeviceLocation, PathNode, PathGraph } from '@/types';
import { Clock, ChevronDown, CornerUpLeft, CornerUpRight, ArrowUp, MapPin } from 'lucide-react';
import { calculateDistance } from '@/lib/coordinateMapper';
import { formatDistance, calculateETA, getAllDirections, type DirectionStep } from '@/lib/turnByTurn';
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
  navigationActive?: boolean;
  turnByTurnActive?: boolean;
  activeRoute?: PathNode[] | null;
  graph?: PathGraph | null;
  onMockArrival?: (destination: Waypoint) => void;
  onRecenterMap?: () => void;
  upcomingEventsCount?: number;
  onShowEvents?: () => void;
  accessibilityMode?: boolean;
  onToggleAccessibility?: (enabled: boolean) => void;
}

export default function NavigationPanel({ businesses, userLocation, defaultDestination, externalStart, externalDestination, onStartJourney, onClearNavigation, title = 'Engage ByDisrupt', onSelectMyLocation, onSelectStartPoint, onStartTurnByTurn, navigationActive = false, turnByTurnActive = false, activeRoute, graph, onMockArrival, onRecenterMap, upcomingEventsCount = 0, onShowEvents, accessibilityMode = false, onToggleAccessibility }: Props) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startId, destId]); // Only depend on the IDs to avoid re-triggering on function reference changes

  // If user picks My location as start, trigger recenter callback (only once)
  const lastCenteredStartId = useRef<string | null>(null);
  useEffect(() => {
    // Only center if this is a NEW start point selection
    if (startId && startId !== lastCenteredStartId.current) {
      lastCenteredStartId.current = startId;
      if (startId === 'my-location') {
        onSelectMyLocation?.();
      } else if (start) {
        onSelectStartPoint?.(start);
      }
    }
  }, [startId, start, onSelectMyLocation, onSelectStartPoint]);

  // Collapsible panel state
  const [open, setOpen] = useState<boolean>(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Expandable directions state
  const [directionsExpanded, setDirectionsExpanded] = useState<boolean>(false);

  // Drag state for handle bar
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [hasDragged, setHasDragged] = useState(false);
  const dragThreshold = 50; // pixels to drag before toggling

  // Compute all directions for the route - ONLY when expanded to avoid lag
  const directions = useMemo(() => {
    if (!directionsExpanded || !activeRoute || activeRoute.length < 2) return [];
    return getAllDirections(activeRoute, graph ?? undefined);
  }, [directionsExpanded, activeRoute, graph]);

  // Removed ResizeObserver - using fixed maxHeight instead for better performance

  // Handle drag events for the handle bar
  const handleDragStart = (clientY: number) => {
    setIsDragging(true);
    setDragStartY(clientY);
    setHasDragged(false);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    // Reset hasDragged after a short delay to prevent click
    setTimeout(() => setHasDragged(false), 100);
  };

  // Listen for mouse/touch move on window when dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const deltaY = dragStartY - clientY;

      // Mark as dragged if moved more than a few pixels
      if (Math.abs(deltaY) > 5) {
        setHasDragged(true);
      }

      // If dragged up more than threshold, open; if down, close
      if (Math.abs(deltaY) > dragThreshold) {
        if (deltaY > 0 && !open) {
          setOpen(true);
        } else if (deltaY < 0 && open) {
          setOpen(false);
        }
        setIsDragging(false);
      }
    };

    const handleEnd = () => {
      handleDragEnd();
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, dragStartY, dragThreshold, open]);


  return (
    <>
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #C5C5C5;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #A0A0A0;
        }
      `}</style>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-2.5">
        <div className="pointer-events-auto w-full rounded-t-3xl border bg-white/95 shadow-xl" style={{ maxWidth: '400px' }}>
        {/* Header / Handle */}
        <div className="w-full rounded-t-3xl p-3 pb-2">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => {
              // Only toggle if user didn't drag
              if (!hasDragged) {
                setOpen((v) => !v);
              }
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              handleDragStart(e.clientY);
            }}
            onTouchStart={(e) => {
              handleDragStart(e.touches[0].clientY);
            }}
            className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-gray-300 cursor-grab active:cursor-grabbing hover:bg-gray-400 transition-colors block"
            style={{ touchAction: 'none' }}
          />
          <div className="flex items-center justify-between px-1">
            {/* Left: Sydney CBD Tag */}
            <div className="flex items-center gap-2">
              <div
                className="flex justify-center items-center text-sm font-medium"
                style={{
                  width: '107px',
                  padding: '5px 13px',
                  gap: '10px',
                  flexShrink: 0,
                  borderRadius: '13px',
                  background: '#FFF',
                  boxShadow: '1px 1px 4px 0 rgba(0, 0, 0, 0.25)'
                }}
              >
                {title}
              </div>
            </div>

            {/* Right: All buttons grouped together */}
            <div className="flex items-center gap-2">
              {/* Recenter Map Button */}
              {onRecenterMap && userLocation && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRecenterMap();
                  }}
                  className="relative flex items-center justify-center hover:opacity-90 transition-opacity flex-shrink-0"
                  style={{ width: '47.988px', height: '47.991px' }}
                  aria-label="Recenter map on your location"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 60 60" fill="none">
                    <defs>
                      <filter id="filter0_d_nav" x="0" y="0" width="59.9876" height="59.9912" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                        <feFlood floodOpacity="0" result="BackgroundImageFix"/>
                        <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                        <feOffset dy="3"/>
                        <feGaussianBlur stdDeviation="3"/>
                        <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.349 0"/>
                        <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_nav"/>
                        <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_nav" result="shape"/>
                      </filter>
                    </defs>
                    <g filter="url(#filter0_d_nav)">
                      <path d="M29.9938 50.9912C43.2452 50.9912 53.9876 40.248 53.9876 26.9956C53.9876 13.7432 43.2452 3 29.9938 3C16.7424 3 6 13.7432 6 26.9956C6 40.248 16.7424 50.9912 29.9938 50.9912Z" fill="white"/>
                    </g>
                    <path fillRule="evenodd" clipRule="evenodd" d="M33.2817 39.5252C32.6448 40.7018 30.6925 40.2809 30.6925 38.9512L28.3622 29.7155L18.3625 27.5632C16.9177 27.5632 16.4827 25.7504 17.7411 25.1717L37.2224 17.181C38.3202 16.6214 39.4128 17.5711 38.781 18.6855L33.2817 39.5252Z" fill="#0096FA"/>
                  </svg>
                </button>
              )}

              {/* Events Notification Bell */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onShowEvents) onShowEvents();
                }}
                className="relative flex items-center justify-center hover:opacity-90 transition-opacity flex-shrink-0"
                style={{ width: '47.988px', height: '47.991px' }}
                aria-label={upcomingEventsCount > 0 ? `${upcomingEventsCount} upcoming events` : 'No new events'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 60 60" fill="none">
                  <defs>
                    <filter id="filter0_d_bell" x="0" y="0" width="59.9876" height="59.9912" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                      <feFlood floodOpacity="0" result="BackgroundImageFix"/>
                      <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                      <feOffset dy="3"/>
                      <feGaussianBlur stdDeviation="3"/>
                      <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.349 0"/>
                      <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_bell"/>
                      <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_bell" result="shape"/>
                    </filter>
                  </defs>
                  <g filter="url(#filter0_d_bell)">
                    <path d="M29.9938 50.9912C43.2452 50.9912 53.9876 40.248 53.9876 26.9956C53.9876 13.7432 43.2452 3 29.9938 3C16.7424 3 6 13.7432 6 26.9956C6 40.248 16.7424 50.9912 29.9938 50.9912Z" fill="white"/>
                  </g>
                  {/* Bell icon path */}
                  <path d="M33 21C33 19.3431 31.6569 18 30 18C28.3431 18 27 19.3431 27 21C24.7909 21.6046 23.1667 23.4606 23 25.75V30.25C23 30.4489 22.921 30.6397 22.7803 30.7803L21.5 32.0607C21.1056 32.4551 21.1056 33.0916 21.5 33.486C21.8944 33.8804 22.531 33.8804 22.9253 33.486L23 33.4113V33.5C23 34.3284 23.6716 35 24.5 35H35.5C36.3284 35 37 34.3284 37 33.5V33.4113L37.0747 33.486C37.469 33.8804 38.1056 33.8804 38.5 33.486C38.8944 33.0916 38.8944 32.4551 38.5 32.0607L37.2197 30.7803C37.079 30.6397 37 30.4489 37 30.25V25.75C36.8333 23.4606 35.2091 21.6046 33 21Z" fill="#404040"/>
                  <path d="M28 37C28 38.1046 28.8954 39 30 39C31.1046 39 32 38.1046 32 37H28Z" fill="#404040"/>
                </svg>
                {/* Blue dot for new notifications */}
                {upcomingEventsCount > 0 && (
                  <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-[#0096FA]"></span>
                )}
              </button>

              {/* Action button in minimized header - only show when panel is collapsed */}
              {!open && start && dest && (
                <>
                  {turnByTurnActive ? (
                    // Show Stop button when turn-by-turn is active
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClearNavigation?.();
                      }}
                      className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-semibold text-white shadow hover:bg-red-700"
                    >
                      Stop
                    </button>
                  ) : navigationActive ? (
                    // Show Start button when route is previewed but turn-by-turn not active
                    onStartTurnByTurn && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onStartTurnByTurn(start, dest);
                        }}
                        className="rounded-full px-4 py-1.5 text-sm font-semibold text-white shadow hover:opacity-90"
                        style={{ background: '#0096FA' }}
                      >
                        Start
                      </button>
                    )
                  ) : (
                    // No route yet, don't show button
                    null
                  )}
                </>
              )}
            </div>
          </div>

          {/* Distance and time - only show when minimized and route exists */}
          {!open && distanceMeters !== null && start && dest && (
            <div className="flex items-center justify-center gap-2 px-4 pb-2 pt-1">
              <span className="text-lg font-bold text-gray-900">
                {formatDistance(distanceMeters)}
              </span>
              <span className="text-gray-400">•</span>
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" style={{ color: '#0096FA' }} />
                <span className="text-base font-semibold" style={{ color: '#0096FA' }}>
                  {calculateETA(distanceMeters)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Animated body */}
        <div
          className="overflow-y-auto transition-[max-height] duration-200 ease-out custom-scrollbar"
          style={{
            maxHeight: open ? '70vh' : '0px',
            willChange: open ? 'max-height' : 'auto',
            scrollbarWidth: 'thin',
            scrollbarColor: '#C5C5C5 transparent'
          }}
        >
          <div
            ref={contentRef}
            className={`px-4 pt-0 pb-6 transition-opacity duration-200 ease-out ${open ? 'opacity-100' : 'opacity-0'}`}
          >
            {/* Section 2: Text Input Boxes */}
            <div className="flex items-center justify-between w-full" style={{ gap: '12px', marginTop: '16px' }}>
              {/* Icon column - ring, dotted line, pin */}
              <div className="flex flex-col items-center relative" style={{ gap: '14px' }}>
                {/* Start point - hollow circle aligned with text box */}
                <div className="flex items-center justify-center relative z-10" style={{ height: '32px' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M6.18549 11.8091C9.04936 11.8091 11.371 9.3779 11.371 6.37883C11.371 3.37977 9.04936 0.948547 6.18549 0.948547C3.32162 0.948547 1 3.37977 1 6.37883C1 9.3779 3.32162 11.8091 6.18549 11.8091Z" stroke="#313131" strokeWidth="2"/>
                  </svg>
                </div>

                {/* Dotted line connecting bottom of ring to top of pin */}
                <div
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{
                    top: '22.5px',
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="1" height="29" viewBox="0 0 1 29" fill="none">
                    <path d="M0.5 0L0.499999 28.4556" stroke="#313131" strokeWidth="1" strokeDasharray="2 2"/>
                  </svg>
                </div>

                {/* Destination - pin icon aligned with text box */}
                <div className="flex items-center justify-center relative z-10" style={{ height: '32px' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="22" viewBox="0 0 13 22" fill="none">
                    <path d="M6.44994 0C8.16057 0 9.80113 0.711624 11.0107 1.97832C12.2203 3.24502 12.8999 4.96304 12.8999 6.75442C12.8999 10.485 6.44994 21.3948 6.44994 21.3948C6.44994 21.3948 0 10.485 0 6.75442C0 4.96304 0.679545 3.24502 1.88914 1.97832C3.09874 0.711624 4.73931 0 6.44994 0Z" fill="#313131"/>
                    <path d="M6.49422 9.26337C8.02346 9.26337 9.26314 7.96516 9.26314 6.36374C9.26314 4.76232 8.02346 3.46411 6.49422 3.46411C4.96499 3.46411 3.72531 4.76232 3.72531 6.36374C3.72531 7.96516 4.96499 9.26337 6.49422 9.26337Z" fill="white"/>
                  </svg>
                </div>
              </div>

              {/* Input fields */}
              <div className="flex flex-col flex-1" style={{ gap: '14px' }}>
                <PredictiveSearch
                  options={options}
                  value={startId}
                  onChange={setStartId}
                  placeholder="Set start point"
                />

                <PredictiveSearch
                  options={options.filter((o) => o.id !== startId)}
                  value={destId}
                  onChange={setDestId}
                  placeholder="Set destination"
                />
              </div>

              {/* Swap Button */}
              <div className="flex items-center justify-center" style={{ height: '78px' }}>
                <button
                  type="button"
                  aria-label="Swap start and destination"
                  onClick={() => { if (startId && destId) { const s = startId; setStartId(destId); setDestId(s); } }}
                  disabled={!startId || !destId}
                  className="hover:opacity-80 active:opacity-60 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
                  style={{ width: '21.35px', height: '20.563px' }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="21" viewBox="0 0 22 21" fill="none">
                    <mask id="mask0_1_317" style={{ maskType: 'luminance' }} maskUnits="userSpaceOnUse" x="0" y="0" width="10" height="21">
                      <path d="M9.28054 0H0V20.563H9.28054V0Z" fill="white"/>
                    </mask>
                    <g mask="url(#mask0_1_317)">
                      <path d="M4.64013 20.5631C4.87571 20.5631 5.10164 20.4521 5.26823 20.2545C5.43481 20.0569 5.52839 19.7889 5.52839 19.5095V2.38428C5.52839 2.10487 5.43481 1.8369 5.26823 1.63932C5.10164 1.44175 4.87571 1.33075 4.64013 1.33075C4.40454 1.33075 4.17861 1.44175 4.01203 1.63932C3.84545 1.8369 3.75186 2.10487 3.75186 2.38428V19.5102C3.75186 19.7896 3.84545 20.0576 4.01203 20.2551C4.17861 20.4527 4.40454 20.5631 4.64013 20.5631Z" fill="#313131"/>
                      <path d="M1.79917e-06 6.4443C-0.000130172 6.65408 0.0543558 6.85878 0.156014 7.03045C0.257672 7.20211 0.401542 7.33236 0.567964 7.40338C0.734386 7.47441 0.91524 7.48276 1.08581 7.42728C1.25638 7.3718 1.40835 7.25521 1.52094 7.09343L4.64055 2.61446L7.76015 7.09343C7.9053 7.30174 8.11428 7.43313 8.34111 7.45869C8.56794 7.48426 8.79404 7.4019 8.96968 7.22974C9.14531 7.05758 9.25609 6.80973 9.27765 6.54069C9.2992 6.27166 9.22976 6.00349 9.08461 5.79518L5.30223 0.369132C5.22161 0.253475 5.12044 0.160362 5.00597 0.0964468C4.89149 0.0325312 4.76652 -0.000610352 4.64 -0.000610352C4.51347 -0.000610352 4.38851 0.0325312 4.27403 0.0964468C4.15955 0.160362 4.05839 0.253475 3.97777 0.369132L0.197029 5.79582C0.0693166 5.97818 -0.000408345 6.20724 1.79917e-06 6.4443Z" fill="#313131"/>
                    </g>
                    <mask id="mask1_1_317" style={{ maskType: 'luminance' }} maskUnits="userSpaceOnUse" x="12" y="0" width="10" height="21">
                      <path d="M12.07 20.563H21.3505L21.3505 -2.09808e-05H12.07L12.07 20.563Z" fill="white"/>
                    </mask>
                    <g mask="url(#mask1_1_317)">
                      <path d="M16.7104 -1.90735e-06C16.4748 -1.90735e-06 16.2489 0.110996 16.0823 0.308571C15.9157 0.506147 15.8221 0.774117 15.8221 1.05353L15.8221 18.1788C15.8221 18.4582 15.9157 18.7262 16.0823 18.9237C16.2489 19.1213 16.4748 19.2323 16.7104 19.2323C16.946 19.2323 17.1719 19.1213 17.3385 18.9237C17.5051 18.7262 17.5987 18.4582 17.5987 18.1788L17.5987 1.05288C17.5987 0.773466 17.5051 0.505497 17.3385 0.30792C17.1719 0.110346 16.946 -1.90735e-06 16.7104 -1.90735e-06Z" fill="#313131"/>
                      <path d="M21.3505 14.1187C21.3507 13.9089 21.2962 13.7042 21.1945 13.5325C21.0929 13.3609 20.949 13.2306 20.7826 13.1596C20.6161 13.0886 20.4353 13.0802 20.2647 13.1357C20.0941 13.1912 19.9422 13.3078 19.8296 13.4696L16.71 17.9485L13.5904 13.4696C13.4452 13.2612 13.2362 13.1299 13.0094 13.1043C12.7826 13.0787 12.5565 13.1611 12.3808 13.3332C12.2052 13.5054 12.0944 13.7533 12.0729 14.0223C12.0513 14.2913 12.1208 14.5595 12.2659 14.7678L16.0483 20.1939C16.1289 20.3095 16.2301 20.4026 16.3446 20.4665C16.459 20.5305 16.584 20.5636 16.7105 20.5636C16.8371 20.5636 16.962 20.5305 17.0765 20.4665C17.191 20.4026 17.2921 20.3095 17.3728 20.1939L21.1535 14.7672C21.2812 14.5848 21.3509 14.3557 21.3505 14.1187Z" fill="#313131"/>
                    </g>
                  </svg>
                </button>
              </div>
            </div>

          {/* Distance and ETA Display with Expandable Directions */}
          {distanceMeters !== null && start && dest && (
            <div className="w-full rounded-2xl overflow-hidden" style={{ marginTop: '16px', background: '#F5F5F5', border: '1px solid #C5C5C5' }}>
              {/* Trip summary - clickable to expand */}
              <button
                type="button"
                onClick={() => setDirectionsExpanded(!directionsExpanded)}
                className="w-full px-5 py-4 text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full p-2" style={{ background: '#0096FA' }}>
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" clipRule="evenodd" d="M9.10095 12.5821C8.74491 13.2398 7.65365 13.0045 7.65365 12.2613L6.35107 7.09882L0.761587 5.89576C-0.0460087 5.89576 -0.289156 4.88251 0.414234 4.55902L11.3036 0.0924871C11.9173 -0.22031 12.528 0.310519 12.1749 0.93344L9.10095 12.5821Z" fill="white"/>
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 font-medium mb-0.5">Trip Details</div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-gray-900">
                          {formatDistance(distanceMeters)}
                        </span>
                        <span className="text-gray-400">•</span>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-4 w-4" style={{ color: '#0096FA' }} />
                          <span className="text-lg font-semibold" style={{ color: '#0096FA' }}>
                            {calculateETA(distanceMeters)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={`transition-transform duration-200 ${directionsExpanded ? 'rotate-180' : ''}`}>
                    <ChevronDown className="h-5 w-5 text-gray-500" />
                  </div>
                </div>
              </button>

              {/* Expandable directions list */}
              {directionsExpanded && directions.length > 0 && (
                <div className="border-t border-blue-200 px-4 py-3 max-h-64 overflow-y-auto custom-scrollbar">
                  <div className="space-y-3">
                    {directions.map((step, idx) => {
                      const getTurnIcon = (turnType: DirectionStep['turnType']) => {
                        switch (turnType) {
                          case 'left':
                            return <CornerUpLeft className="h-4 w-4 text-blue-600" />;
                          case 'right':
                            return <CornerUpRight className="h-4 w-4 text-blue-600" />;
                          case 'arrive':
                            return <MapPin className="h-4 w-4 text-green-600" />;
                          default:
                            return <ArrowUp className="h-4 w-4 text-blue-600" />;
                        }
                      };

                      return (
                        <div
                          key={idx}
                          className={`flex items-start gap-3 ${idx === directions.length - 1 ? '' : 'pb-3 border-b border-blue-100'}`}
                        >
                          <div className={`mt-0.5 rounded-full p-1.5 ${step.turnType === 'arrive' ? 'bg-green-100' : 'bg-blue-100'}`}>
                            {getTurnIcon(step.turnType)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{step.instruction}</p>
                            {step.distance > 0 && (
                              <p className="text-xs text-gray-500 mt-0.5">{formatDistance(step.distance)}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section 3: Buttons */}
          <div className="flex w-full items-center justify-between" style={{ marginTop: '16px', gap: '12px' }}>
            {/* Left group: Start Journey + Clear */}
            <div className="flex items-center" style={{ gap: '12px' }}>
              <button
                disabled={!start || !dest}
                onClick={() => start && dest && onStartJourney(start, dest)}
                className="inline-flex items-center justify-center gap-2 hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex-shrink-0"
                style={{
                  display: 'flex',
                  width: '130px',
                  height: '32px',
                  padding: '8px 13px',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '10px',
                  borderRadius: '19px',
                  background: '#0096FA'
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="9" height="10" viewBox="0 0 9 10" fill="none" style={{ width: '9.836px', height: '10.756px', flexShrink: 0 }}>
                  <path d="M0.712693 9.46429C0.286872 9.66226 -0.152301 9.21712 0.0513942 8.79401L4.14872 0.28312C4.3345 -0.102796 4.88784 -0.091731 5.05805 0.301305L8.72425 8.76704C8.91105 9.19838 8.45344 9.62574 8.03587 9.40993L4.8412 7.75886C4.70374 7.68782 4.54115 7.68442 4.40084 7.74965L0.712693 9.46429Z" fill="white"/>
                </svg>
                <span style={{
                  color: '#FFF',
                  fontFamily: 'Figtree',
                  fontSize: '14px',
                  fontStyle: 'normal',
                  fontWeight: 500,
                  lineHeight: 'normal',
                  flexShrink: 0
                }}>Start Journey</span>
              </button>
              {(startId || destId) && (
                <button
                  onClick={() => {
                    setStartId('');
                    setDestId('');
                    onClearNavigation?.();
                  }}
                  className="hover:opacity-80 active:opacity-60 transition-opacity flex-shrink-0"
                  style={{
                    display: 'flex',
                    width: '76px',
                    height: '32px',
                    padding: '3px 14px',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '10px',
                    borderRadius: '19px',
                    border: '1px solid #707070',
                    background: '#FFF',
                    color: '#707070',
                    textAlign: 'center',
                    fontFamily: 'Figtree',
                    fontSize: '14px',
                    fontStyle: 'normal',
                    fontWeight: 500,
                    lineHeight: 'normal'
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Right group: Accessibility Toggle */}
            <button
              type="button"
              role="switch"
              aria-checked={accessibilityMode}
              onClick={() => onToggleAccessibility?.(!accessibilityMode)}
              className="hover:opacity-80 active:opacity-60 flex items-center flex-shrink-0"
              aria-label="Toggle accessibility mode"
              style={{
                display: 'flex',
                height: '32px',
                padding: '4px 8px',
                alignItems: 'center',
                gap: '8px',
                borderRadius: '19px',
                border: 'none',
                background: 'transparent'
              }}
            >
              {/* Accessibility Icon */}
              <svg xmlns="http://www.w3.org/2000/svg" width="21" height="24" viewBox="0 0 21 24" fill="none" style={{ width: '20.181px', height: '23.032px', flexShrink: 0 }}>
                <mask id="mask0_1_285" style={{ maskType: 'luminance' }} maskUnits="userSpaceOnUse" x="0" y="0" width="21" height="24">
                  <path d="M20.1805 0H0V23.0325H20.1805V0Z" fill="white"/>
                </mask>
                <g mask="url(#mask0_1_285)">
                  <path d="M13.305 14.8134C13.305 15.8289 13.0174 16.8216 12.4786 17.6659C11.9399 18.5103 11.1741 19.1684 10.2782 19.557C9.38233 19.9456 8.39649 20.0473 7.4454 19.8492C6.4943 19.6511 5.62067 19.1621 4.93497 18.444C4.24927 17.7259 3.7823 16.8111 3.59311 15.8151C3.40393 14.8191 3.50103 13.7867 3.87212 12.8485C4.24322 11.9103 4.87166 11.1084 5.67795 10.5442C6.48425 9.98002 7.4322 9.67889 8.40193 9.67889" stroke="#313131" strokeWidth="2" strokeMiterlimit="10"/>
                  <path d="M9.98175 6.01354C10.8782 6.01354 11.6049 5.2525 11.6049 4.31371C11.6049 3.37493 10.8782 2.61389 9.98175 2.61389C9.08528 2.61389 8.35855 3.37493 8.35855 4.31371C8.35855 5.2525 9.08528 6.01354 9.98175 6.01354Z" stroke="#313131" strokeWidth="2" strokeMiterlimit="10"/>
                  <path d="M9.9816 6.01068V13.1723H16.2098V20.4169H18.9612" stroke="#313131" strokeWidth="2" strokeMiterlimit="10"/>
                  <path d="M9.9816 9.32874H14.8512" stroke="#313131" strokeWidth="2" strokeMiterlimit="10"/>
                </g>
              </svg>

              {/* Toggle Switch */}
              <div className="relative" style={{ width: '50.243px', height: '24px', flexShrink: 0 }}>
                {/* Outer track - with transition */}
                <svg xmlns="http://www.w3.org/2000/svg" width="51" height="24" viewBox="0 0 51 24" fill="none" style={{ position: 'absolute', top: 0, left: 0, transition: 'all 0.2s ease' }}>
                  <path d="M11.4591 0H38.7837C41.8228 0 44.7375 1.26428 46.8865 3.51472C49.0355 5.76516 50.2427 8.8174 50.2427 12C50.2427 15.1826 49.0355 18.2348 46.8865 20.4853C44.7375 22.7357 41.8228 24 38.7837 24H11.4591C8.41992 24 5.50527 22.7357 3.35628 20.4853C1.20729 18.2348 0 15.1826 0 12C0 8.8174 1.20729 5.76516 3.35628 3.51472C5.50527 1.26428 8.41992 0 11.4591 0Z" fill={accessibilityMode ? '#0096FA' : '#ACACAC'}/>
                </svg>

                {/* Inner circle - LEFT when OFF (false), RIGHT when ON (true) */}
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: accessibilityMode ? '30.377px' : '4px',
                  transform: 'translateY(-50%)',
                  transition: 'left 0.2s ease',
                  willChange: 'left'
                }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="17" viewBox="0 0 16 17" fill="none" style={{ width: '15.866px', height: '16.615px' }}>
                    <path d="M7.9328 16.6146C12.314 16.6146 15.8656 12.8953 15.8656 8.30728C15.8656 3.7193 12.314 0 7.9328 0C3.55163 0 0 3.7193 0 8.30728C0 12.8953 3.55163 16.6146 7.9328 16.6146Z" fill="white"/>
                  </svg>
                </div>
              </div>
            </button>
          </div>

          </div>
        </div>
      </div>
    </div>
    </>
  );
}


