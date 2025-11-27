/**
 * PHASE 5: Canvas Overlay for High-Performance Rendering
 *
 * Renders dynamic map elements (POIs, routes, markers) on a Canvas layer
 * for better performance with large numbers of elements (100+ POIs).
 *
 * Architecture:
 * - SVG base layer: Static map background
 * - Canvas overlay: Dynamic elements (POIs, routes, user marker)
 * - Syncs with SVG pan/zoom transforms
 *
 * Performance Benefits:
 * - GPU-accelerated rendering
 * - Efficient redrawing (only changed elements)
 * - Better with 100+ POIs vs SVG DOM manipulation
 */

"use client";

import { useEffect, useRef, useCallback } from 'react';
import type { Business, PathNode, DeviceLocation } from '@/types';

interface CanvasOverlayProps {
  // Map state
  viewBox: { minX: number; minY: number; width: number; height: number };
  transform: { scale: number; positionX: number; positionY: number };
  rotation: number; // Map rotation in degrees

  // Elements to render
  businesses: Business[];
  selectedBusiness: Business | null;
  activeRoute?: PathNode[] | null;
  userLocation?: DeviceLocation;
  smoothNavMarker?: { x: number; y: number; angleDeg: number } | null;
  navigationStart?: Business | null;
  navigationDestination?: Business | null;
  showPOIMarkers?: boolean;

  // Callbacks
  onBusinessClick?: (business: Business) => void;
  projectLatLng: (lat: number, lng: number) => { x: number; y: number };
}

export default function CanvasOverlay({
  viewBox,
  transform,
  rotation,
  businesses,
  selectedBusiness,
  activeRoute,
  userLocation,
  smoothNavMarker,
  navigationStart,
  navigationDestination,
  showPOIMarkers = false,
  onBusinessClick,
  projectLatLng
}: CanvasOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  /**
   * Convert SVG coordinates to Canvas pixel coordinates
   * Takes into account pan/zoom transform
   */
  const svgToCanvas = useCallback(
    (svgX: number, svgY: number): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      // Calculate position relative to viewBox
      const relX = (svgX - viewBox.minX) / viewBox.width;
      const relY = (svgY - viewBox.minY) / viewBox.height;

      // Apply transform (scale and position)
      const x = relX * canvas.width * transform.scale + transform.positionX;
      const y = relY * canvas.height * transform.scale + transform.positionY;

      return { x, y };
    },
    [viewBox, transform]
  );

  /**
   * Draw a POI marker
   */
  const drawPOIMarker = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      business: Business,
      isSelected: boolean,
      isNavPoint: boolean
    ) => {
      const coords = projectLatLng(business.lat, business.lng);
      const canvasCoords = svgToCanvas(coords.x, coords.y);

      // Marker size
      const size = isNavPoint ? 16 : isSelected ? 14 : 10;
      const halfSize = size / 2;

      // Marker color
      let fillColor = '#3B82F6'; // blue-500
      if (isNavPoint) fillColor = '#10B981'; // green-500 for nav points
      if (isSelected) fillColor = '#EF4444'; // red-500 for selected

      // Draw marker circle
      ctx.beginPath();
      ctx.arc(canvasCoords.x, canvasCoords.y, halfSize, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();

      // Draw white border
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw shadow for depth
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
    },
    [projectLatLng, svgToCanvas]
  );

  /**
   * Draw navigation route
   */
  const drawRoute = useCallback(
    (ctx: CanvasRenderingContext2D, route: PathNode[]) => {
      if (route.length < 2) return;

      ctx.beginPath();
      ctx.strokeStyle = '#3B82F6'; // blue-500
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Move to first point
      const start = svgToCanvas(route[0].x, route[0].y);
      ctx.moveTo(start.x, start.y);

      // Draw line through all points
      for (let i = 1; i < route.length; i++) {
        const point = svgToCanvas(route[i].x, route[i].y);
        ctx.lineTo(point.x, point.y);
      }

      ctx.stroke();

      // Draw route shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
    },
    [svgToCanvas]
  );

  /**
   * Draw user location marker
   */
  const drawUserLocation = useCallback(
    (ctx: CanvasRenderingContext2D, location: DeviceLocation) => {
      const coords = projectLatLng(location.lat, location.lng);
      const canvasCoords = svgToCanvas(coords.x, coords.y);

      // Outer circle (pulse effect)
      ctx.beginPath();
      ctx.arc(canvasCoords.x, canvasCoords.y, 20, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)'; // blue with transparency
      ctx.fill();

      // Inner circle
      ctx.beginPath();
      ctx.arc(canvasCoords.x, canvasCoords.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#3B82F6'; // blue-500
      ctx.fill();

      // White border
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Center dot
      ctx.beginPath();
      ctx.arc(canvasCoords.x, canvasCoords.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    },
    [projectLatLng, svgToCanvas]
  );

  /**
   * Draw navigation arrow (heading indicator)
   */
  const drawNavArrow = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      marker: { x: number; y: number; angleDeg: number }
    ) => {
      const canvasCoords = svgToCanvas(marker.x, marker.y);

      ctx.save();
      ctx.translate(canvasCoords.x, canvasCoords.y);
      ctx.rotate((marker.angleDeg * Math.PI) / 180);

      // Draw arrow
      ctx.beginPath();
      ctx.moveTo(0, -20); // Top point
      ctx.lineTo(-12, 12); // Bottom left
      ctx.lineTo(0, 6); // Middle bottom
      ctx.lineTo(12, 12); // Bottom right
      ctx.closePath();

      ctx.fillStyle = '#10B981'; // green-500
      ctx.fill();

      // Arrow border
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();
    },
    [svgToCanvas]
  );

  /**
   * Main render function
   */
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Reset transforms and shadows
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Apply map rotation if active
    if (rotation !== 0) {
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);
    }

    // Draw route first (behind markers)
    if (activeRoute && activeRoute.length >= 2) {
      drawRoute(ctx, activeRoute);
    }

    // Draw POI markers
    if (showPOIMarkers && businesses.length > 0) {
      businesses.forEach((business) => {
        const isSelected = selectedBusiness?.id === business.id;
        const isNavPoint =
          navigationStart?.id === business.id ||
          navigationDestination?.id === business.id;

        drawPOIMarker(ctx, business, isSelected, isNavPoint);
      });
    }

    // Draw user location
    if (userLocation) {
      drawUserLocation(ctx, userLocation);
    }

    // Draw navigation arrow
    if (smoothNavMarker) {
      drawNavArrow(ctx, smoothNavMarker);
    }
  }, [
    viewBox,
    transform,
    rotation,
    businesses,
    selectedBusiness,
    activeRoute,
    userLocation,
    smoothNavMarker,
    navigationStart,
    navigationDestination,
    showPOIMarkers,
    drawPOIMarker,
    drawRoute,
    drawUserLocation,
    drawNavArrow
  ]);

  /**
   * Handle canvas resizing
   */
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    // Set canvas size to match parent
    const rect = parent.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Trigger re-render
    render();
  }, [render]);

  /**
   * Handle click events on canvas
   */
  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onBusinessClick) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;

      // Check if click is near any POI marker
      const clickRadius = 20; // pixels

      for (const business of businesses) {
        const coords = projectLatLng(business.lat, business.lng);
        const canvasCoords = svgToCanvas(coords.x, coords.y);

        const distance = Math.hypot(
          canvasCoords.x - clickX,
          canvasCoords.y - clickY
        );

        if (distance <= clickRadius) {
          onBusinessClick(business);
          return;
        }
      }
    },
    [businesses, onBusinessClick, projectLatLng, svgToCanvas]
  );

  // Initialize canvas and handle resizing
  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [resizeCanvas]);

  // Re-render when dependencies change
  useEffect(() => {
    // Cancel any pending animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Schedule render on next animation frame
    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [render]);

  return (
    <canvas
      ref={canvasRef}
      onClick={handleCanvasClick}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: showPOIMarkers ? 'auto' : 'none',
        cursor: showPOIMarkers ? 'pointer' : 'default'
      }}
    />
  );
}
