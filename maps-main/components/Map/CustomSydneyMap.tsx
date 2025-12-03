"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TransformComponent, TransformWrapper, ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { VIEWBOX, gpsToSvg, setSvgBounds, setCalibration, isWithinMapBounds, normalizeLatitude, normalizeLongitude } from '@/lib/coordinateMapper';
import { useVisibleMarkers } from '@/hooks/useVisibleMarkers';
import type { Business, DeviceLocation } from '@/types';
import MapControls from './MapControls';
import type { PathNode } from '@/types';
import { routeToSvgPath } from '@/lib/routeDrawer';
import { SvgDebugWrapper } from '@/components/SvgDebugWrapper';
import { CONTROL_POINTS, debugResiduals, getMapTransform, latLngToSvgUsingTransform } from '@/lib/mapCalibration';
import { MAP_CONSTANTS, GPS_CORNERS } from '@/lib/mapConfig';
import FloorSelector from './FloorSelector';

const MAP_PIN_SVG_COORD = MAP_CONSTANTS.INITIAL_CENTER; // Target SVG point to center on
const INITIAL_ZOOM_MULTIPLIER = MAP_CONSTANTS.INITIAL_ZOOM_MULTIPLIER; // Zoom multiplier after fitting content

// Type for transform state
interface TransformState {
  scale: number;
  positionX: number;
  positionY: number;
}

interface Props {
  businesses: Business[];
  selectedBusiness: Business | null;
  userLocation?: DeviceLocation;
  onBusinessClick?: (business: Business) => void;
  activeRoute?: PathNode[] | null;
  onCenterOnUser?: boolean;
  onCenterOnPoint?: { lat: number; lng: number; tick: number; targetScale?: number } | null;
  smoothNavMarker?: { x: number; y: number; angleDeg: number } | null;
  navigationStart?: Business | null;
  navigationDestination?: Business | null;
  showGraphOverlay?: boolean;
  debugTransformLogTick?: number;
  zoomConfig?: import('@/types').ZoomConfig; // Optional for backwards compatibility
  mapRotation?: number; // Rotation angle in degrees (0 = north-up, heading = heading-up)
  turnByTurnActive?: boolean; // Whether turn-by-turn navigation is active
  showPOIMarkers?: boolean; // Show visible POI markers (when filtering is active)
  indoorModeActive?: boolean; // Whether indoor navigation mode is active
  buildingData?: any; // Building data with floors and connection points
  selectedFloorId?: string | null; // Currently selected floor ID
  onExitIndoorMode?: () => void; // Callback to exit indoor mode
  onFloorChange?: (floorId: string) => void; // Callback when floor changes
  onIndoorPOIClick?: (poi: any) => void; // Callback when indoor POI is clicked
  indoorNavigationStart?: any; // Indoor navigation start POI
  indoorNavigationDestination?: any; // Indoor navigation destination POI
  indoorRoute?: Array<{x: number; y: number; floorId?: string}> | null; // Indoor navigation route with floor info
}

const FALLBACK_VIEWBOX = `${VIEWBOX.minX} ${VIEWBOX.minY} ${VIEWBOX.width} ${VIEWBOX.height}`;

export default function CustomSydneyMap({ businesses, selectedBusiness, userLocation, onBusinessClick, activeRoute, onCenterOnUser, onCenterOnPoint, smoothNavMarker, navigationStart, navigationDestination, showGraphOverlay = false, debugTransformLogTick, zoomConfig, mapRotation = 0, turnByTurnActive: turnByTurnActiveProp = false, showPOIMarkers = false, indoorModeActive = false, buildingData, selectedFloorId, onExitIndoorMode, onFloorChange, onIndoorPOIClick, indoorNavigationStart, indoorNavigationDestination, indoorRoute }: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const [svgLoaded, setSvgLoaded] = useState<boolean>(false);
  const [viewBox, setViewBox] = useState<{ minX: number; minY: number; width: number; height: number }>({
    minX: VIEWBOX.minX,
    minY: VIEWBOX.minY,
    width: VIEWBOX.width,
    height: VIEWBOX.height
  });
  const [viewBoxStr, setViewBoxStr] = useState<string>(FALLBACK_VIEWBOX);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [svgContent, setSvgContent] = useState<string>('');
  const svgContentRef = useRef<SVGGElement>(null);

  // PERFORMANCE: Track viewport bounds for marker culling
  const [viewBounds, setViewBounds] = useState<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null>(null);

  const lastScaleRef = useRef<number>(1);
  const logTransformsUntilRef = useRef<number>(0);
  const lastViewportUpdateRef = useRef<number>(0); // NEW: throttle timestamp
  const ACTIVITY_LOG_WINDOW_MS = 5000;
  const isDev = false; // Hidden for demo - was: process.env.NODE_ENV === 'development'

  useEffect(() => {
    if (!isDev) return;
    debugResiduals();
  }, [isDev]);

  const projectLatLng = useCallback((lat: number, lng: number) => gpsToSvg(lat, lng), []);

  const validateBusinessCoords = useCallback((business: Business, coords: { x: number; y: number }) => {
    if (process.env.NODE_ENV === 'production') return;
    const { x, y } = coords;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      // eslint-disable-next-line no-console
      console.warn('Invalid marker coords', { name: business.name, lat: business.lat, lng: business.lng, x, y });
    }
    if (x < 0 || x > VIEWBOX.width || y < 0 || y > VIEWBOX.height) {
      // eslint-disable-next-line no-console
      console.warn('Marker outside viewBox', { name: business.name, lat: business.lat, lng: business.lng, x, y });
    }
  }, []);

  // Remove prior fit logic; rely on the SVG to naturally fill the container

  const maybeLogTransform = useCallback(
    (source: string, detail?: Record<string, unknown>) => {
      if (Date.now() > logTransformsUntilRef.current) return;
      const state = (transformRef.current as ReactZoomPanPinchRef & { state?: TransformState })?.state;
      console.log(`[TransformLog] ${source}`, {
        detail,
        scale: state?.scale,
        positionX: state?.positionX,
        positionY: state?.positionY,
      });
    },
    []
  );

  useEffect(() => {
    if (!debugTransformLogTick) return;
    logTransformsUntilRef.current = Date.now() + ACTIVITY_LOG_WINDOW_MS;
    console.log(`[TransformLog] Monitoring panning/zooming for ${ACTIVITY_LOG_WINDOW_MS}ms (trigger=${debugTransformLogTick})`);
  }, [debugTransformLogTick, ACTIVITY_LOG_WINDOW_MS]);

  // Centers the map on a GPS point. If targetScale is omitted, keeps current zoom.
  const centerToLatLng = useCallback((
    transform: ReactZoomPanPinchRef,
    lat: number,
    lng: number,
    opts?: { targetScale?: number; durationMs?: number; scale?: number; rotation?: number }  // Added rotation parameter
  ) => {
    const wrapper = transform.instance?.wrapperComponent as HTMLElement | undefined;
    if (!wrapper) return;

    const normalizedLat = normalizeLatitude(lat);
    const normalizedLng = normalizeLongitude(lng);
    const svg = projectLatLng(normalizedLat, normalizedLng);
    const viewportWidth = wrapper.offsetWidth;
    const viewportHeight = wrapper.offsetHeight;

    // Calculate the render scale factor (SVG viewBox → rendered pixels)
    // The SVG uses preserveAspectRatio="xMidYMid meet", so it scales uniformly to fit
    const renderScaleX = viewportWidth / viewBox.width;
    const renderScaleY = viewportHeight / viewBox.height;
    const renderScale = Math.min(renderScaleX, renderScaleY);

    // Calculate centering offset (for xMidYMid)
    const scaledSvgWidth = viewBox.width * renderScale;
    const scaledSvgHeight = viewBox.height * renderScale;
    const offsetX = (viewportWidth - scaledSvgWidth) / 2;
    const offsetY = (viewportHeight - scaledSvgHeight) / 2;

    // Convert SVG viewBox coordinates to rendered pixel coordinates
    const renderedX = svg.x * renderScale + offsetX;
    const renderedY = svg.y * renderScale + offsetY;

    const currentScale = (transform as ReactZoomPanPinchRef & { state?: TransformState })?.state?.scale ?? lastScaleRef.current ?? 1;
    // Support both 'scale' and 'targetScale' for backwards compatibility
    const scale = opts?.scale ?? (typeof opts?.targetScale === 'number' ? opts.targetScale : currentScale);
    const duration = opts?.durationMs ?? 400; // Default to 400ms animation
    const rotation = opts?.rotation ?? 0; // Default to no rotation

    // Calculate transform to center the point.
    // react-zoom-pan-pinch outputs CSS transforms as translate(...) scale(...), meaning scale runs first.
    // Translate values are therefore already in screen pixels; do not divide by the zoom factor.
    const x = viewportWidth / 2 - renderedX * scale;
    const y = viewportHeight / 2 - renderedY * scale;

    if (Date.now() <= logTransformsUntilRef.current) {
      console.log('[TransformLog] centerToLatLng target', {
        lat,
        lng,
        normalizedLat,
        normalizedLng,
        translateX: x,
        translateY: y,
        scale,
        renderedX,
        renderedY,
        duration,
        rotation,
      });
    }

    // Use setTransform with rotation parameter
    (transform as any).setTransform(x, y, scale, duration, 'easeOut', rotation);
    lastScaleRef.current = scale;  // Update last scale
  }, [projectLatLng, viewBox]);

  // PERFORMANCE: Update viewport bounds on pan/zoom for marker culling
  const updateViewportBounds = useCallback((ref: ReactZoomPanPinchRef) => {
    // Throttle updates to reduce re-renders during rapid pan/zoom
    const now = Date.now();
    const THROTTLE_MS = 150;
    if (now - lastViewportUpdateRef.current < THROTTLE_MS) {
      return; // Skip update if called too soon
    }
    lastViewportUpdateRef.current = now;

    const state = (ref as ReactZoomPanPinchRef & { state?: TransformState })?.state;
    if (!state) return;

    const wrapper = ref.instance?.wrapperComponent as HTMLElement;
    if (!wrapper) return;

    const { scale, positionX, positionY } = state;
    const width = wrapper.offsetWidth;
    const height = wrapper.offsetHeight;

    // Calculate visible SVG coordinates from screen coordinates
    const renderScaleX = width / viewBox.width;
    const renderScaleY = height / viewBox.height;
    const renderScale = Math.min(renderScaleX, renderScaleY);

    const scaledSvgWidth = viewBox.width * renderScale;
    const scaledSvgHeight = viewBox.height * renderScale;
    const offsetX = (width - scaledSvgWidth) / 2;
    const offsetY = (height - scaledSvgHeight) / 2;

    // Convert screen viewport to SVG coordinate space
    const minX = (-positionX - offsetX) / (renderScale * scale);
    const maxX = (width - positionX - offsetX) / (renderScale * scale);
    const minY = (-positionY - offsetY) / (renderScale * scale);
    const maxY = (height - positionY - offsetY) / (renderScale * scale);

    setViewBounds({ minX, maxX, minY, maxY });
  }, [viewBox]);

  // Preload SVG image and extract viewBox to set bounds
  useEffect(() => {
    // Reset loading state when switching maps
    setSvgLoaded(false);

    // Determine which SVG to load based on indoor mode
    let svgPath = '/maps/20251028SydneyMap-01.svg'; // Default outdoor map

    if (indoorModeActive && buildingData && selectedFloorId) {
      const selectedFloor = buildingData.floors?.find((f: any) => f.id === selectedFloorId);
      if (selectedFloor?.svgPath) {
        svgPath = selectedFloor.svgPath;
      }
    }

    fetch(svgPath)
      .then((r) => r.text())
      .then((txt) => {
        const m = txt.match(/viewBox\s*=\s*"([^"]+)"/i);
        if (m) {
          const parts = m[1].trim().split(/\s+/).map(Number);
          if (parts.length === 4) {
            const [minX, minY, w, h] = parts;
            if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
              setSvgBounds(w, h);
              setViewBox({ minX, minY, width: w, height: h });
              setViewBoxStr(`${minX} ${minY} ${w} ${h}`);

              /**
               * GPS ↔ SVG Coordinate Calibration
               *
               * Using 4-corner calibration for the map area.
               * These define the geographic boundaries of the visible map.
               *
               * Map coverage: Darling Harbour to Kings Cross, Observatory to Central Station
               */
              setCalibration([
                { gps: { lat: -33.85721, lng: 151.20121 }, svg: { x: 0, y: 0 } },           // Northwest (Barangaroo Reserve)
                { gps: { lat: -33.85794, lng: 151.21008 }, svg: { x: w, y: 0 } },           // Northeast (Overseas Passenger Terminal)
                { gps: { lat: -33.88317, lng: 151.20695 }, svg: { x: w, y: h } },           // Southeast (Haymarket / Central)
                { gps: { lat: -33.8757, lng: 151.20172 }, svg: { x: 0, y: h } },            // Southwest (Darling Square / Tumbalong Park)
              ]);
              // Map is now loaded and ready
              setMapLoaded(true);
            }
          }
        }

        // Extract SVG inner content (everything between <svg> tags)
        // Remove the outer <svg> tag since we'll inject content into our own SVG wrapper
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(txt, 'image/svg+xml');
        const svgElement = svgDoc.querySelector('svg');
        if (svgElement) {
          // Get all child elements as HTML string
          const innerHTML = Array.from(svgElement.children)
            .map(child => new XMLSerializer().serializeToString(child))
            .join('');
          setSvgContent(innerHTML);
        }

        setSvgLoaded(true);
      })
      .catch(() => setSvgLoaded(false));
  }, [indoorModeActive, buildingData, selectedFloorId]);

  // No complex event listener setup needed anymore - using simple onClick handler!

  const markers = useMemo(() => {
    return businesses.map((b, idx) => {
      const svg = projectLatLng(b.lat, b.lng);
      validateBusinessCoords(b, svg);
      return {
        ...b,
        svg,
        idx: idx + 1,
      };
    });
  }, [businesses, projectLatLng, validateBusinessCoords]);

  // PERFORMANCE: Only render markers visible in viewport (reduces DOM nodes by ~90%)
  // EXCEPTION: When search is active (showPOIMarkers), show ALL results regardless of viewport
  const visibleMarkers = useVisibleMarkers(markers, showPOIMarkers ? null : viewBounds, 150);

  // Removed complex SVG DOM manipulation - using simple POI markers instead for performance

  const controlPointTransform = useMemo(() => getMapTransform(), []);

  const userSvg = useMemo(() => {
    if (!userLocation) return null;
    return projectLatLng(userLocation.lat, userLocation.lng);
  }, [projectLatLng, userLocation]);
  const [followMe, setFollowMe] = useState(false);
  const [turnByTurnActive, setTurnByTurnActive] = useState(false);

  // Debug wrapper size on mount
  useEffect(() => {
    if (wrapperRef.current) {
      // eslint-disable-next-line no-console
      console.log('🔍 WRAPPER SIZE:', {
        offsetWidth: wrapperRef.current.offsetWidth,
        offsetHeight: wrapperRef.current.offsetHeight,
        clientWidth: wrapperRef.current.clientWidth,
        clientHeight: wrapperRef.current.clientHeight,
      });
    }
  }, []);

  // Debug: log wrapper and svg sizes when map/viewBox loads
  useEffect(() => {
    if (!transformRef.current) return;
    const wrapper = transformRef.current.instance?.wrapperComponent as HTMLElement | undefined;
    const content = transformRef.current.instance?.contentComponent as HTMLElement | undefined;
    // eslint-disable-next-line no-console
    console.log('🧭 MAP DIMENSIONS', {
      wrapperWidth: wrapper?.offsetWidth,
      wrapperHeight: wrapper?.offsetHeight,
      contentWidth: content?.offsetWidth,
      contentHeight: content?.offsetHeight,
      viewBox,
      viewBoxStr,
      svgLoaded,
    });
  }, [mapLoaded, svgLoaded, viewBoxStr, viewBox]);

  // 1) Initial centering: pin MAP_PIN_SVG_COORD to the visual center at a zoomed-in scale
  useEffect(() => {
    if (!mapLoaded || !transformRef.current) return;

    requestAnimationFrame(() => {
      const wrapper = transformRef.current?.instance?.wrapperComponent as HTMLElement | undefined;
      if (!wrapper) return;

      const viewportWidth = wrapper.offsetWidth;
      const viewportHeight = wrapper.offsetHeight;

      // 1) Base SVG render scale (viewBox -> screen pixels)
      const renderScaleX = viewportWidth / viewBox.width;
      const renderScaleY = viewportHeight / viewBox.height;
      const renderScale = Math.min(renderScaleX, renderScaleY);

      const scaledSvgWidth = viewBox.width * renderScale;
      const scaledSvgHeight = viewBox.height * renderScale;

      // Because of preserveAspectRatio="xMidYMid meet", the SVG is centered with letterboxing
      const offsetX = (viewportWidth - scaledSvgWidth) / 2;
      const offsetY = (viewportHeight - scaledSvgHeight) / 2;

      // 2) Convert the SVG coordinate to rendered pixel coordinates
      const renderedX = MAP_PIN_SVG_COORD.x * renderScale + offsetX;
      const renderedY = MAP_PIN_SVG_COORD.y * renderScale + offsetY;

      // 3) Choose how zoomed-in you want to be in react-zoom-pan-pinch space
      const scale = zoomConfig?.initial ?? INITIAL_ZOOM_MULTIPLIER; // Use config or fallback to constant

      // 4) Center of the screen (same as your crosshair)
      const screenCenterX = viewportWidth / 2;
      const screenCenterY = viewportHeight / 2;

      // 5) Translate so the rendered point lands exactly at the screen center
      const positionX = screenCenterX - renderedX * scale;
      const positionY = screenCenterY - renderedY * scale;

      if (transformRef.current) {
        transformRef.current.setTransform(positionX, positionY, scale, 0, 'easeOut');
        lastScaleRef.current = scale;
      }

      // Debug – verify it numerically
      const screenX = renderedX * scale + positionX;
      const screenY = renderedY * scale + positionY;
      console.log('[INIT CENTER]', {
        viewportWidth,
        viewportHeight,
        renderScale,
        renderedX,
        renderedY,
        scale,
        positionX,
        positionY,
        screenX,
        screenY,
        screenCenterX,
        screenCenterY,
      });
    });
  }, [mapLoaded, viewBox]);

  // 2) Center on specific point when requested (e.g., selection)
  useEffect(() => {
    if (!mapLoaded || !onCenterOnPoint || !transformRef.current) return;
    const { lat, lng, tick, targetScale } = onCenterOnPoint;
    if (!tick) return;
    requestAnimationFrame(() => {
      if (transformRef.current) {
        // Use requested zoom if provided, else keep current zoom for smooth pan-only
        const opts = typeof targetScale === 'number' ? { targetScale, durationMs: 600 } : { durationMs: 600 };
        centerToLatLng(transformRef.current, lat, lng, opts);
      }
    });
  }, [onCenterOnPoint?.tick, mapLoaded, centerToLatLng, onCenterOnPoint]);

  // 3) Center on user when requested (only if within map bounds)
  // Only trigger on onCenterOnUser changes, NOT on userLocation changes to allow free panning
  useEffect(() => {
    if (!mapLoaded || !onCenterOnUser || !userSvg || !transformRef.current || !userLocation) return;
    if (!isWithinMapBounds({ lat: userLocation.lat, lng: userLocation.lng })) return;
    requestAnimationFrame(() => {
      if (transformRef.current && userLocation) {
        // Use navigation zoom when centering on user (follow mode)
        const scale = zoomConfig?.navigation ?? 2.5;
        centerToLatLng(transformRef.current, userLocation.lat, userLocation.lng, { scale, durationMs: 500 });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCenterOnUser, mapLoaded, zoomConfig]);

  // Reset and center view when indoor mode changes or floor changes
  useEffect(() => {
    if (!transformRef.current || !svgLoaded) return;

    // Reset transform to fit the entire SVG in view
    requestAnimationFrame(() => {
      if (transformRef.current) {
        transformRef.current.resetTransform(300);
      }
    });
  }, [indoorModeActive, selectedFloorId, svgLoaded]);

  // 4) Update map rotation continuously during turn-by-turn navigation
  useEffect(() => {
    if (!mapLoaded || !transformRef.current) return;
    if (!turnByTurnActiveProp) return; // Only rotate during turn-by-turn

    const transform = transformRef.current;
    const wrapper = transform.instance?.wrapperComponent as HTMLElement | undefined;
    if (!wrapper) return;

    const state = (transform as ReactZoomPanPinchRef & { state?: TransformState })?.state;
    if (!state) return;

    // Apply rotation smoothly without disrupting current position/scale
    const currentScale = state.scale ?? lastScaleRef.current ?? 1;
    const currentX = state.positionX ?? 0;
    const currentY = state.positionY ?? 0;

    // Use smooth animation for rotation updates (200ms feels natural for heading changes)
    (transform as any).setTransform(currentX, currentY, currentScale, 200, 'easeOut', mapRotation);

    console.log('🧭 Map rotation updated:', mapRotation);
  }, [mapRotation, turnByTurnActiveProp, mapLoaded]);

  return (
    <div ref={wrapperRef} className="w-full h-full overflow-hidden bg-neutral-100">
      <TransformWrapper
        ref={transformRef}
        minScale={MAP_CONSTANTS.MIN_SCALE}
        maxScale={MAP_CONSTANTS.MAX_SCALE}
        initialScale={1.0}
        // Let our custom transform control initial centering
        limitToBounds={false}
        centerOnInit={false}
        centerZoomedOut={false}
        // Smooth wheel zoom with smaller steps for better control
        wheel={{
          step: MAP_CONSTANTS.WHEEL_STEP,              // Smaller steps = more granular zoom control
          smoothStep: MAP_CONSTANTS.WHEEL_SMOOTH_STEP,        // Smoother wheel animation
        }}
        // Enable double-click zoom
        doubleClick={{
          disabled: false,
          step: MAP_CONSTANTS.DOUBLE_CLICK_ZOOM_STEP,               // Zoom amount on double-click
        }}
        // Smooth panning
        panning={{
          disabled: false,
          velocityDisabled: false,  // Enable momentum/velocity panning
        }}
        // Animation settings for smooth zoom/pan
        velocityAnimation={{
          sensitivity: MAP_CONSTANTS.VELOCITY_SENSITIVITY,          // Pan momentum sensitivity
          animationTime: MAP_CONSTANTS.VELOCITY_ANIMATION_TIME,      // Duration of momentum animation (ms)
          equalToMove: true,       // Momentum proportional to swipe speed
        }}
        // Callbacks
        onInit={(ref) => {
          try {
            const state = (ref as ReactZoomPanPinchRef & { state?: TransformState })?.state;
            lastScaleRef.current = state?.scale ?? 1;
            maybeLogTransform('onInit', state as unknown as Record<string, unknown>);
            // PERFORMANCE: Set initial viewport bounds for marker culling
            updateViewportBounds(ref);
          } catch {
            maybeLogTransform('onInit');
          }
        }}
        onTransformed={(ref) => {
          try {
            const state = (ref as ReactZoomPanPinchRef & { state?: TransformState })?.state;
            lastScaleRef.current = state?.scale ?? lastScaleRef.current;
            maybeLogTransform('onTransformed', state as unknown as Record<string, unknown>);
            // PERFORMANCE: Update viewport bounds for marker culling
            updateViewportBounds(ref);
          } catch {
            maybeLogTransform('onTransformed');
          }
        }}
        onZoomStop={(ref) => {
          try {
            const state = (ref as ReactZoomPanPinchRef & { state?: TransformState })?.state;
            lastScaleRef.current = state?.scale ?? lastScaleRef.current;
            maybeLogTransform('onZoomStop', state as unknown as Record<string, unknown>);
          } catch {
            maybeLogTransform('onZoomStop');
          }
        }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <MapControls
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              onReset={() => resetTransform()}
              onRecenter={userLocation && transformRef.current ? () => {
                if (transformRef.current && userLocation) {
                  centerToLatLng(transformRef.current, userLocation.lat, userLocation.lng, { durationMs: 300 });
                }
              } : undefined}
              followMe={followMe}
              onToggleFollowMe={() => setFollowMe((f) => !f)}
            />

            {/* Floor Selector - Only show in indoor mode */}
            {indoorModeActive && buildingData?.floors && onFloorChange && (
              <FloorSelector
                floors={buildingData.floors}
                selectedFloorId={selectedFloorId || null}
                onFloorChange={onFloorChange}
              />
            )}

            <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full">
              <SvgDebugWrapper
                viewBox={viewBoxStr}
                preserveAspectRatio="xMidYMid meet"
                className="w-full h-full"
                debugEnabled={isDev}
              >
                {/* Base background to ensure visible area even if image fails */}
                <rect x={viewBox.minX} y={viewBox.minY} width={viewBox.width} height={viewBox.height} fill="#f8fafc" />
                {svgLoaded && svgContent ? (
                  <g
                    id="inline-svg-content"
                    ref={svgContentRef}
                    dangerouslySetInnerHTML={{ __html: svgContent }}
                    onClick={(e) => {
                      // Only handle clicks in indoor mode
                      if (!indoorModeActive || !buildingData || !selectedFloorId) return;

                      const currentFloor = buildingData.floors?.find((f: any) => f.id === selectedFloorId);
                      if (!currentFloor?.indoorPOIs) return;

                      // Traverse up the DOM tree to find the POI group element
                      let target = e.target as Element | null;
                      let foundPoi = null;

                      // Keep going up until we find a POI or reach the SVG root
                      while (target && target !== e.currentTarget) {
                        const elementId = target.id;

                        if (elementId) {
                          // Check if this ID matches any POI
                          const poi = currentFloor.indoorPOIs.find((p: any) => p.svgElementId === elementId);
                          if (poi) {
                            foundPoi = poi;
                            console.log('🎯 POI clicked:', poi.name, '(element:', elementId, ')');
                            break;
                          }
                        }

                        // Move up to parent
                        target = target.parentElement;
                      }

                      // If we found a POI, open the modal
                      if (foundPoi) {
                        e.stopPropagation();
                        onIndoorPOIClick?.(foundPoi);
                      }
                    }}
                    style={{ cursor: indoorModeActive ? 'pointer' : 'default' }}
                  />
                ) : (
                  <rect x="0" y="0" width={viewBox.width} height={viewBox.height} fill="#f3f4f6" />
                )}

                {/* Graph overlay (development only) */}
                {showGraphOverlay && process.env.NODE_ENV === 'development' && (() => {
                  const graph = (window as Window & { __SYD_GRAPH__?: import('@/types').PathGraph }).__SYD_GRAPH__;
                  if (!graph) return null;

                  const edges: JSX.Element[] = [];
                  const nodes: JSX.Element[] = [];

                  // Render edges (faint gray lines)
                  Object.entries(graph.adjacency).forEach(([fromId, neighbors]) => {
                    const fromNode = graph.nodesById[fromId];
                    if (!fromNode) return;

                    neighbors.forEach((edge, idx) => {
                      const toNode = graph.nodesById[edge.to];
                      if (!toNode) return;

                      edges.push(
                        <line
                          key={`edge-${fromId}-${edge.to}-${idx}`}
                          x1={fromNode.x}
                          y1={fromNode.y}
                          x2={toNode.x}
                          y2={toNode.y}
                          stroke="#94a3b8"
                          strokeWidth={2}
                          opacity={0.3}
                        />
                      );
                    });
                  });

                  // Identify route start/end nodes for highlighting
                  const routeStartId = activeRoute && activeRoute.length > 0 ? activeRoute[0].id : null;
                  const routeEndId = activeRoute && activeRoute.length > 0 ? activeRoute[activeRoute.length - 1].id : null;

                  // Render nodes (small circles, highlight start/end)
                  Object.values(graph.nodesById).forEach((node) => {
                    let fill = "#64748b";  // Default gray
                    let radius = 4;
                    let opacity = 0.5;

                    // Highlight route start node in green
                    if (node.id === routeStartId) {
                      fill = "#22c55e";  // Green
                      radius = 8;
                      opacity = 0.9;
                    }
                    // Highlight route end node in red
                    else if (node.id === routeEndId) {
                      fill = "#ef4444";  // Red
                      radius = 8;
                      opacity = 0.9;
                    }

                    nodes.push(
                      <circle
                        key={`node-${node.id}`}
                        cx={node.x}
                        cy={node.y}
                        r={radius}
                        fill={fill}
                        opacity={opacity}
                        stroke={node.id === routeStartId || node.id === routeEndId ? "#fff" : "none"}
                        strokeWidth={node.id === routeStartId || node.id === routeEndId ? 2 : 0}
                      />
                    );
                  });

                  return (
                    <g id="graph-overlay" pointerEvents="none">
                      {edges}
                      {nodes}
                    </g>
                  );
                })()}

                {/* Indoor navigation route - only show segments on current floor */}
                {indoorModeActive && indoorRoute && indoorRoute.length > 0 && (() => {
                  // Filter route nodes to only those on the current floor
                  const currentFloorNodes = indoorRoute.filter(node =>
                    !node.floorId || node.floorId === selectedFloorId
                  );

                  if (currentFloorNodes.length === 0) return null;

                  // Build continuous path segments on this floor
                  const segments: Array<Array<{x: number; y: number}>> = [];
                  let currentSegment: Array<{x: number; y: number}> = [];

                  indoorRoute.forEach((node, index) => {
                    if (!node.floorId || node.floorId === selectedFloorId) {
                      currentSegment.push(node);
                    } else {
                      // Floor change - save current segment if it has points
                      if (currentSegment.length > 0) {
                        segments.push(currentSegment);
                        currentSegment = [];
                      }
                    }

                    // Last node - save segment
                    if (index === indoorRoute.length - 1 && currentSegment.length > 0) {
                      segments.push(currentSegment);
                    }
                  });

                  return (
                    <g id="indoor-route" pointerEvents="none">
                      {segments.map((segment, idx) => (
                        <polyline
                          key={idx}
                          points={segment.map(p => `${p.x},${p.y}`).join(' ')}
                          fill="none"
                          stroke="#3b82f6"
                          strokeWidth={6}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity={0.8}
                        />
                      ))}
                    </g>
                  );
                })()}

                {/* Indoor navigation markers */}
                {indoorModeActive && (
                  <g id="indoor-markers" pointerEvents="none">
                    {/* Start marker - only show on the floor where start POI is located */}
                    {indoorNavigationStart && indoorNavigationStart.floorId === selectedFloorId && (
                      <g transform={`translate(${indoorNavigationStart.x},${indoorNavigationStart.y})`}>
                        <circle cx="0" cy="0" r="12" fill="#22c55e" opacity="0.9" stroke="#fff" strokeWidth="3" />
                        <text
                          x="0"
                          y="0"
                          fontSize="12"
                          fontWeight="bold"
                          fill="#fff"
                          textAnchor="middle"
                          dominantBaseline="central"
                        >
                          S
                        </text>
                      </g>
                    )}

                    {/* Destination marker - only show on the floor where destination POI is located */}
                    {indoorNavigationDestination && indoorNavigationDestination.floorId === selectedFloorId && (
                      <g transform={`translate(${indoorNavigationDestination.x},${indoorNavigationDestination.y})`}>
                        <circle cx="0" cy="0" r="12" fill="#ef4444" opacity="0.9" stroke="#fff" strokeWidth="3" />
                        <text
                          x="0"
                          y="0"
                          fontSize="12"
                          fontWeight="bold"
                          fill="#fff"
                          textAnchor="middle"
                          dominantBaseline="central"
                        >
                          D
                        </text>
                      </g>
                    )}
                  </g>
                )}

                {/* PERFORMANCE: Business markers - Conditional rendering to minimize DOM nodes */}
                <g>
                  {/* PASS 1: Visible POI pin markers (only when showPOIMarkers is true) */}
                  {showPOIMarkers && visibleMarkers.map((m) => (
                    <g
                      key={`pin-${m.id}`}
                      onClick={() => onBusinessClick?.(m)}
                      className="cursor-pointer"
                      style={{ pointerEvents: 'auto' }}
                    >
                      {/* Pin shadow */}
                      <ellipse cx={m.svg.x + 1} cy={m.svg.y + 12} rx={4} ry={1.5} fill="#000" opacity="0.2" />
                      {/* Pin body - Red location pin */}
                      <path
                        d={`M ${m.svg.x} ${m.svg.y - 10}
                           C ${m.svg.x - 8} ${m.svg.y - 10}, ${m.svg.x - 8} ${m.svg.y - 4}, ${m.svg.x - 8} ${m.svg.y - 2}
                           C ${m.svg.x - 8} ${m.svg.y + 2}, ${m.svg.x} ${m.svg.y + 8}, ${m.svg.x} ${m.svg.y + 10}
                           C ${m.svg.x} ${m.svg.y + 8}, ${m.svg.x + 8} ${m.svg.y + 2}, ${m.svg.x + 8} ${m.svg.y - 2}
                           C ${m.svg.x + 8} ${m.svg.y - 4}, ${m.svg.x + 8} ${m.svg.y - 10}, ${m.svg.x} ${m.svg.y - 10} Z`}
                        fill="#ef4444"
                        stroke="#b91c1c"
                        strokeWidth={1}
                      />
                      {/* Inner white circle */}
                      <circle cx={m.svg.x} cy={m.svg.y - 5} r={3} fill="#fff" />
                    </g>
                  ))}

                  {/* PASS 2: Invisible click targets (only when showPOIMarkers is false) */}
                  {!showPOIMarkers && visibleMarkers.map((m) => (
                    <circle
                      key={`target-${m.id}`}
                      cx={m.svg.x}
                      cy={m.svg.y}
                      r={20}
                      fill="transparent"
                      onClick={() => onBusinessClick?.(m)}
                      className="cursor-pointer"
                      style={{ pointerEvents: 'auto' }}
                    />
                  ))}
                </g>

                {/* Selected business highlight - Yellow pulsing ring */}
                {selectedBusiness && (() => {
                  const selectedSvg = projectLatLng(selectedBusiness.lat, selectedBusiness.lng);
                  return (
                    <g>
                      {/* Outer pulsing ring */}
                      <circle
                        cx={selectedSvg.x}
                        cy={selectedSvg.y}
                        r={12}
                        fill="none"
                        stroke="#FFDA03"
                        strokeWidth={2}
                        opacity="0.4"
                      >
                        <animate
                          attributeName="r"
                          from="8"
                          to="18"
                          dur="1.5s"
                          repeatCount="indefinite"
                        />
                        <animate
                          attributeName="opacity"
                          from="0.6"
                          to="0"
                          dur="1.5s"
                          repeatCount="indefinite"
                        />
                      </circle>
                      {/* Inner solid ring */}
                      <circle
                        cx={selectedSvg.x}
                        cy={selectedSvg.y}
                        r={8}
                        fill="none"
                        stroke="#FFDA03"
                        strokeWidth={2.5}
                        opacity="0.9"
                      />
                      {/* Center dot */}
                      <circle
                        cx={selectedSvg.x}
                        cy={selectedSvg.y}
                        r={3}
                        fill="#FFDA03"
                        opacity="1"
                      />
                    </g>
                  );
                })()}

                {/* Active route overlay - draw BEFORE arrow so arrow is on top */}
                {activeRoute && activeRoute.length >= 2 && (
                  <g>
                    <path d={routeToSvgPath(activeRoute, (window as Window & { __SYD_GRAPH__?: import('@/types').PathGraph }).__SYD_GRAPH__)} stroke="#1e3a8a" strokeWidth={8} fill="none" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
                  </g>
                )}

                {/* Start Point Marker - Hidden when start is "my-location" */}
                {navigationStart && navigationStart.id !== 'my-location' && (() => {
                  const startSvg = projectLatLng(navigationStart.lat, navigationStart.lng);
                  return (
                    <g
                      onClick={() => onBusinessClick?.(navigationStart)}
                      className="cursor-pointer"
                      style={{ pointerEvents: 'auto' }}
                    >
                      {/* Pin shadow */}
                      <ellipse cx={startSvg.x + 1} cy={startSvg.y + 18} rx={5} ry={2} fill="#000" opacity="0.3" />

                      {/* Pin body - Dark Blue */}
                      <path
                        d={`M ${startSvg.x} ${startSvg.y - 15}
                           C ${startSvg.x - 12} ${startSvg.y - 15}, ${startSvg.x - 12} ${startSvg.y - 6}, ${startSvg.x - 12} ${startSvg.y - 3}
                           C ${startSvg.x - 12} ${startSvg.y + 3}, ${startSvg.x} ${startSvg.y + 12}, ${startSvg.x} ${startSvg.y + 15}
                           C ${startSvg.x} ${startSvg.y + 12}, ${startSvg.x + 12} ${startSvg.y + 3}, ${startSvg.x + 12} ${startSvg.y - 3}
                           C ${startSvg.x + 12} ${startSvg.y - 6}, ${startSvg.x + 12} ${startSvg.y - 15}, ${startSvg.x} ${startSvg.y - 15} Z`}
                        fill="#1e3a8a"
                        stroke="#fff"
                        strokeWidth={2}
                      />

                      {/* Pin center circle */}
                      <circle cx={startSvg.x} cy={startSvg.y - 6} r={5} fill="#fff" />

                      {/* "S" for Start */}
                      <text x={startSvg.x} y={startSvg.y - 3} textAnchor="middle" fontSize={10} fontWeight={700} fill="#1e3a8a">
                        S
                      </text>
                    </g>
                  );
                })()}

                {/* Destination Point Marker */}
                {navigationDestination && (() => {
                  const destSvg = projectLatLng(navigationDestination.lat, navigationDestination.lng);
                  return (
                    <g
                      onClick={() => onBusinessClick?.(navigationDestination)}
                      className="cursor-pointer"
                      style={{ pointerEvents: 'auto' }}
                    >
                      {/* Pin shadow */}
                      <ellipse cx={destSvg.x + 1} cy={destSvg.y + 18} rx={5} ry={2} fill="#000" opacity="0.3" />

                      {/* Pin body - Dark Blue */}
                      <path
                        d={`M ${destSvg.x} ${destSvg.y - 15}
                           C ${destSvg.x - 12} ${destSvg.y - 15}, ${destSvg.x - 12} ${destSvg.y - 6}, ${destSvg.x - 12} ${destSvg.y - 3}
                           C ${destSvg.x - 12} ${destSvg.y + 3}, ${destSvg.x} ${destSvg.y + 12}, ${destSvg.x} ${destSvg.y + 15}
                           C ${destSvg.x} ${destSvg.y + 12}, ${destSvg.x + 12} ${destSvg.y + 3}, ${destSvg.x + 12} ${destSvg.y - 3}
                           C ${destSvg.x + 12} ${destSvg.y - 6}, ${destSvg.x + 12} ${destSvg.y - 15}, ${destSvg.x} ${destSvg.y - 15} Z`}
                        fill="#1e3a8a"
                        stroke="#fff"
                        strokeWidth={2}
                      />

                      {/* Pin center circle */}
                      <circle cx={destSvg.x} cy={destSvg.y - 6} r={5} fill="#fff" />

                      {/* "D" for Destination */}
                      <text x={destSvg.x} y={destSvg.y - 3} textAnchor="middle" fontSize={10} fontWeight={700} fill="#1e3a8a">
                        D
                      </text>
                    </g>
                  );
                })()}

                {/* User location */}
                {userSvg && (() => {
                  const arrowX = smoothNavMarker?.x ?? userSvg.x;
                  const arrowY = smoothNavMarker?.y ?? userSvg.y;
                  const isInBounds = arrowX >= -50 && arrowX <= viewBox.width + 50 && arrowY >= -50 && arrowY <= viewBox.height + 50;

                  return isInBounds ? (
                  <g pointerEvents="none">
                    {/* GOOGLE MAPS NAVIGATION INDICATOR - Cone spotlight + blue dot */}
                    {/* Position snaps to route if smoothNavMarker exists, but rotation follows device heading */}
                    <g
                      id="nav-indicator"
                      transform={`translate(${arrowX}, ${arrowY}) rotate(${
                        typeof userLocation?.heading === 'number' ? userLocation.heading : 0
                      })`}
                      style={{
                        transition: 'transform 0.3s ease-out',
                        transformOrigin: 'center'
                      }}
                    >
                      {/* GPS Accuracy circle - shows location uncertainty, rendered first so it's behind everything */}
                      {userLocation?.accuracy && userLocation.accuracy > 0 && (
                        <circle
                          cx={0}
                          cy={0}
                          r={Math.max(40, userLocation.accuracy * 0.7)}
                          fill="#ffffff"
                          stroke="#ffffff"
                          strokeWidth={0.8}
                          opacity={0.1}
                        />
                      )}

                      {/* Cone/spotlight showing heading direction - semi-transparent beam */}
                      <path
                        d="M 0 0 L -7 -30 L 7 -30 Z"
                        fill="#ffffff"
                        opacity="0.6"
                      />

                      {/* Outer circle - main location marker */}
                      <circle
                        cx={0}
                        cy={0}
                        r={6}
                        fill="#1e3a8a"
                        stroke="#ffffff"
                        strokeWidth={2}
                        opacity="1"
                      />

                      {/* Inner center dot */}
                      <circle
                        cx={0}
                        cy={0}
                        r={2.5}
                        fill="#1e3a8a"
                        opacity="1"
                      />

                      {/* Pulsing ring animation when on route */}
                      {smoothNavMarker && (
                        <circle
                          cx={0}
                          cy={0}
                          r={8}
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth={1.2}
                          opacity="0.4"
                        >
                          <animate
                            attributeName="r"
                            from="8"
                            to="14"
                            dur="1.5s"
                            repeatCount="indefinite"
                          />
                          <animate
                            attributeName="opacity"
                            from="0.6"
                            to="0"
                            dur="1.5s"
                            repeatCount="indefinite"
                          />
                        </circle>
                      )}
                    </g>
                  </g>
                  ) : null;
                })()}
                {isDev && controlPointTransform && CONTROL_POINTS.map((point) => {
                  const projected = latLngToSvgUsingTransform(point.lat, point.lng, controlPointTransform);
                  return (
                    <g key={`control-${point.name}`}>
                      <circle cx={point.svgX} cy={point.svgY} r={6} fill="none" stroke="lime" strokeWidth={2} />
                      <circle cx={projected.x} cy={projected.y} r={4} fill="none" stroke="magenta" strokeWidth={2} />
                    </g>
                  );
                })}

                {/* Indoor navigation connection points */}
                {indoorModeActive && buildingData && selectedFloorId && (() => {
                  const selectedFloor = buildingData.floors?.find((f: any) => f.id === selectedFloorId);
                  if (!selectedFloor?.connectionPoints) return null;

                  return selectedFloor.connectionPoints.map((point: any) => (
                    <g key={point.id}>
                      {/* Connection point marker */}
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={12}
                        fill={point.type === 'elevator' ? '#8b5cf6' : '#3b82f6'}
                        opacity={0.9}
                        stroke="white"
                        strokeWidth={2}
                      />
                      {/* Icon text */}
                      <text
                        x={point.x}
                        y={point.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="white"
                        fontSize="10"
                        fontWeight="bold"
                      >
                        {point.type === 'elevator' ? 'E' : 'S'}
                      </text>
                      {/* Label */}
                      <text
                        x={point.x}
                        y={point.y + 20}
                        textAnchor="middle"
                        fill="#1f2937"
                        fontSize="8"
                        fontWeight="500"
                      >
                        {point.name}
                      </text>
                    </g>
                  ));
                })()}

              </SvgDebugWrapper>
            </TransformComponent>

            {/* Indoor mode exit button - top left with hover expand */}
            {indoorModeActive && onExitIndoorMode && (
              <div className="absolute top-4 left-4 z-50">
                <button
                  onClick={onExitIndoorMode}
                  className="group px-3 py-2 bg-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-0 hover:gap-2 overflow-hidden hover:px-4"
                  style={{ minWidth: '40px' }}
                >
                  <svg className="w-5 h-5 text-gray-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  <span className="text-sm font-medium text-gray-900 whitespace-nowrap max-w-0 group-hover:max-w-xs opacity-0 group-hover:opacity-100 transition-all duration-300">
                    Exit back to map
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </TransformWrapper>
    </div>
  );
}

// Auto-fit to businesses when list changes
// We place this after the component for clarity but it's logically part of the same file
