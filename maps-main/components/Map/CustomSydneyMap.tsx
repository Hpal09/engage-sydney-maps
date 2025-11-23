"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TransformComponent, TransformWrapper, ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { VIEWBOX, gpsToSvg, setSvgBounds, setCalibration, isWithinMapBounds, normalizeLatitude, normalizeLongitude } from '@/lib/coordinateMapper';
import type { Business, DeviceLocation } from '@/types';
import MapControls from './MapControls';
import type { PathNode } from '@/types';
import { routeToSvgPath } from '@/lib/routeDrawer';
import { SvgDebugWrapper } from '@/components/SvgDebugWrapper';
import { CONTROL_POINTS, debugResiduals, getMapTransform, latLngToSvgUsingTransform } from '@/lib/mapCalibration';
import { MAP_CONSTANTS, GPS_CORNERS } from '@/lib/mapConfig';

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
}

const FALLBACK_VIEWBOX = `${VIEWBOX.minX} ${VIEWBOX.minY} ${VIEWBOX.width} ${VIEWBOX.height}`;

export default function CustomSydneyMap({ businesses, selectedBusiness, userLocation, onBusinessClick, activeRoute, onCenterOnUser, onCenterOnPoint, smoothNavMarker, navigationStart, navigationDestination, showGraphOverlay = false, debugTransformLogTick, zoomConfig, mapRotation = 0, turnByTurnActive: turnByTurnActiveProp = false }: Props) {
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

  const lastScaleRef = useRef<number>(1);
  const logTransformsUntilRef = useRef<number>(0);
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

  // Preload SVG image and extract viewBox to set bounds
  useEffect(() => {
    fetch('/maps/20251028SydneyMap-01.svg')
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
  }, []);

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
            maybeLogTransform('onInit', state);
          } catch {
            maybeLogTransform('onInit');
          }
        }}
        onTransformed={(ref) => {
          try {
            const state = (ref as ReactZoomPanPinchRef & { state?: TransformState })?.state;
            lastScaleRef.current = state?.scale ?? lastScaleRef.current;
            maybeLogTransform('onTransformed', state);
          } catch {
            maybeLogTransform('onTransformed');
          }
        }}
        onZoomStop={(ref) => {
          try {
            const state = (ref as ReactZoomPanPinchRef & { state?: TransformState })?.state;
            lastScaleRef.current = state?.scale ?? lastScaleRef.current;
            maybeLogTransform('onZoomStop', state);
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

                {/* Business markers - Simple transparent dots for performance */}
                <g>
                  {markers.map((m) => (
                    <g
                      key={m.id}
                      onClick={() => onBusinessClick?.(m)}
                      className="cursor-pointer"
                      style={{ pointerEvents: 'auto' }}
                    >
                      {/* Outer glow */}
                      <circle
                        cx={m.svg.x}
                        cy={m.svg.y}
                        r={12}
                        fill={m.id === selectedBusiness?.id ? '#ef4444' : '#3b82f6'}
                        opacity="0.3"
                      />
                      {/* Main dot */}
                      <circle
                        cx={m.svg.x}
                        cy={m.svg.y}
                        r={6}
                        fill={m.id === selectedBusiness?.id ? '#ef4444' : '#3b82f6'}
                        stroke="#fff"
                        strokeWidth={2}
                        opacity="0.9"
                      />
                    </g>
                  ))}
                </g>

                {/* Active route overlay - draw BEFORE arrow so arrow is on top */}
                {activeRoute && activeRoute.length >= 2 && (
                  <g>
                    <path d={routeToSvgPath(activeRoute, (window as Window & { __SYD_GRAPH__?: import('@/types').PathGraph }).__SYD_GRAPH__)} stroke="#3b82f6" strokeWidth={8} fill="none" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
                  </g>
                )}

                {/* Start Point Marker (Green Pin) - Hidden when start is "my-location" */}
                {navigationStart && navigationStart.id !== 'my-location' && (() => {
                  const startSvg = projectLatLng(navigationStart.lat, navigationStart.lng);
                  return (
                    <g
                      onClick={() => onBusinessClick?.(navigationStart)}
                      className="cursor-pointer"
                      style={{ pointerEvents: 'auto' }}
                    >
                      {/* Pin shadow */}
                      <ellipse cx={startSvg.x + 2} cy={startSvg.y + 30} rx={9} ry={4} fill="#000" opacity="0.3" />

                      {/* Pin body - Green */}
                      <path
                        d={`M ${startSvg.x} ${startSvg.y - 25}
                           C ${startSvg.x - 20} ${startSvg.y - 25}, ${startSvg.x - 20} ${startSvg.y - 10}, ${startSvg.x - 20} ${startSvg.y - 5}
                           C ${startSvg.x - 20} ${startSvg.y + 5}, ${startSvg.x} ${startSvg.y + 20}, ${startSvg.x} ${startSvg.y + 25}
                           C ${startSvg.x} ${startSvg.y + 20}, ${startSvg.x + 20} ${startSvg.y + 5}, ${startSvg.x + 20} ${startSvg.y - 5}
                           C ${startSvg.x + 20} ${startSvg.y - 10}, ${startSvg.x + 20} ${startSvg.y - 25}, ${startSvg.x} ${startSvg.y - 25} Z`}
                        fill="#22c55e"
                        stroke="#fff"
                        strokeWidth={4}
                      />

                      {/* Pin center circle */}
                      <circle cx={startSvg.x} cy={startSvg.y - 10} r={9} fill="#fff" />

                      {/* "S" for Start */}
                      <text x={startSvg.x} y={startSvg.y - 5} textAnchor="middle" fontSize={18} fontWeight={700} fill="#22c55e">
                        S
                      </text>
                    </g>
                  );
                })()}

                {/* Destination Point Marker (Red Pin) */}
                {navigationDestination && (() => {
                  const destSvg = projectLatLng(navigationDestination.lat, navigationDestination.lng);
                  return (
                    <g
                      onClick={() => onBusinessClick?.(navigationDestination)}
                      className="cursor-pointer"
                      style={{ pointerEvents: 'auto' }}
                    >
                      {/* Pin shadow */}
                      <ellipse cx={destSvg.x + 2} cy={destSvg.y + 30} rx={9} ry={4} fill="#000" opacity="0.3" />

                      {/* Pin body - Red */}
                      <path
                        d={`M ${destSvg.x} ${destSvg.y - 25}
                           C ${destSvg.x - 20} ${destSvg.y - 25}, ${destSvg.x - 20} ${destSvg.y - 10}, ${destSvg.x - 20} ${destSvg.y - 5}
                           C ${destSvg.x - 20} ${destSvg.y + 5}, ${destSvg.x} ${destSvg.y + 20}, ${destSvg.x} ${destSvg.y + 25}
                           C ${destSvg.x} ${destSvg.y + 20}, ${destSvg.x + 20} ${destSvg.y + 5}, ${destSvg.x + 20} ${destSvg.y - 5}
                           C ${destSvg.x + 20} ${destSvg.y - 10}, ${destSvg.x + 20} ${destSvg.y - 25}, ${destSvg.x} ${destSvg.y - 25} Z`}
                        fill="#ef4444"
                        stroke="#fff"
                        strokeWidth={4}
                      />

                      {/* Pin center circle */}
                      <circle cx={destSvg.x} cy={destSvg.y - 10} r={9} fill="#fff" />

                      {/* "D" for Destination */}
                      <text x={destSvg.x} y={destSvg.y - 5} textAnchor="middle" fontSize={18} fontWeight={700} fill="#ef4444">
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
                          fill="#4285F4"
                          stroke="#4285F4"
                          strokeWidth={0.8}
                          opacity={0.15}
                        />
                      )}

                      {/* Cone/spotlight showing heading direction - semi-transparent beam */}
                      <path
                        d="M 0 0 L -7 -30 L 7 -30 Z"
                        fill="#4285F4"
                        opacity="0.4"
                      />

                      {/* Outer blue circle - main location marker */}
                      <circle
                        cx={0}
                        cy={0}
                        r={6}
                        fill="#4285F4"
                        stroke="#ffffff"
                        strokeWidth={2}
                        opacity="1"
                      />

                      {/* Inner white center dot */}
                      <circle
                        cx={0}
                        cy={0}
                        r={2.5}
                        fill="#ffffff"
                        opacity="1"
                      />

                      {/* Pulsing ring animation when on route */}
                      {smoothNavMarker && (
                        <circle
                          cx={0}
                          cy={0}
                          r={8}
                          fill="none"
                          stroke="#4285F4"
                          strokeWidth={1.2}
                          opacity="0.6"
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

              </SvgDebugWrapper>
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}

// Auto-fit to businesses when list changes
// We place this after the component for clarity but it's logically part of the same file
