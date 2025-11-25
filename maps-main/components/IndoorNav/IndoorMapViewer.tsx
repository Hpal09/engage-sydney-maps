"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { TransformComponent, TransformWrapper, ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { ArrowUp, ArrowDown, Accessibility, Play, Pause, RotateCcw, X } from "lucide-react";
import MapControls from '../Map/MapControls';

type ConnectionPoint = {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  connectsToFloorId: string | null;
  isAccessible: boolean;
};

type Floor = {
  id: string;
  name: string;
  floorNumber: number;
  svgPath: string;
  connectionPoints: ConnectionPoint[];
};

type Building = {
  id: string;
  name: string;
  floors: Floor[];
};

type PathSegment = {
  floorId: string;
  points: { x: number; y: number }[];
  transition?: {
    type: "stairs" | "elevator";
    name: string;
    toFloorId: string;
  };
};

type Point = { floorId: string; x: number; y: number; name?: string };

type Props = {
  building: Building;
  accessibilityMode?: boolean;
  onAccessibilityToggle?: (enabled: boolean) => void;
};

export default function IndoorMapViewer({
  building,
  accessibilityMode = false,
  onAccessibilityToggle,
}: Props) {
  const sortedFloors = [...building.floors].sort((a, b) => a.floorNumber - b.floorNumber);
  const [currentFloorIndex, setCurrentFloorIndex] = useState(0);
  const [svgContent, setSvgContent] = useState<string>("");
  const [svgViewBox, setSvgViewBox] = useState<string>("");
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationProgress, setAnimationProgress] = useState(0);
  const [path, setPath] = useState<PathSegment[]>([]);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [endPoint, setEndPoint] = useState<Point | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<Point | null>(null);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const svgContainerRef = useRef<HTMLDivElement | null>(null);

  const currentFloor = sortedFloors[currentFloorIndex];

  // Load SVG content
  useEffect(() => {
    if (!currentFloor) return;

    fetch(currentFloor.svgPath)
      .then((res) => res.text())
      .then((svg) => {
        setSvgContent(svg);

        // Extract viewBox from SVG
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svg, "image/svg+xml");
        const svgEl = svgDoc.documentElement;
        const viewBox = svgEl.getAttribute("viewBox") || "0 0 1400 800";
        setSvgViewBox(viewBox);
        console.log('[IndoorNav] Loaded SVG with viewBox:', viewBox);
      })
      .catch((err) => console.error("Error loading SVG:", err));
  }, [currentFloor]);

  // Calculate path when start/end points change
  useEffect(() => {
    if (startPoint && endPoint) {
      const calculatedPath = calculatePath(
        building,
        startPoint,
        endPoint,
        accessibilityMode
      );
      setPath(calculatedPath);

      if (calculatedPath.length > 0) {
        setIsAnimating(true);
        setAnimationProgress(0);

        const startFloorIndex = sortedFloors.findIndex(f => f.id === startPoint.floorId);
        if (startFloorIndex !== -1) {
          setCurrentFloorIndex(startFloorIndex);
        }
      }
    } else {
      setPath([]);
    }
  }, [startPoint, endPoint, accessibilityMode, building, sortedFloors]);

  // Animation loop
  useEffect(() => {
    if (!isAnimating || path.length === 0) return;

    const interval = setInterval(() => {
      setAnimationProgress((prev) => {
        const next = prev + 0.005;
        if (next >= 1) {
          setIsAnimating(false);
          return 1;
        }
        return next;
      });
    }, 16);

    return () => clearInterval(interval);
  }, [isAnimating, path]);

  // Auto-switch floor during animation
  useEffect(() => {
    if (!isAnimating || path.length === 0) return;

    let cumulativeProgress = 0;
    const totalSegments = path.length;
    const progressPerSegment = 1 / totalSegments;

    for (let i = 0; i < path.length; i++) {
      cumulativeProgress += progressPerSegment;
      if (animationProgress <= cumulativeProgress) {
        const segmentFloor = sortedFloors.findIndex(f => f.id === path[i].floorId);
        if (segmentFloor !== -1 && segmentFloor !== currentFloorIndex) {
          setCurrentFloorIndex(segmentFloor);
        }
        break;
      }
    }
  }, [animationProgress, path, sortedFloors, currentFloorIndex, isAnimating]);

  const goToFloor = (index: number) => {
    setCurrentFloorIndex(index);
    setIsAnimating(false);
  };

  const toggleAnimation = () => {
    if (animationProgress >= 1) {
      setAnimationProgress(0);
    }
    setIsAnimating(!isAnimating);
  };

  const resetAnimation = () => {
    setAnimationProgress(0);
    setIsAnimating(false);
    const startFloorIndex = sortedFloors.findIndex(f => f.id === startPoint?.floorId);
    if (startFloorIndex !== -1) {
      setCurrentFloorIndex(startFloorIndex);
    }
  };

  const clearRoute = () => {
    setStartPoint(null);
    setEndPoint(null);
    setPath([]);
    setAnimationProgress(0);
    setIsAnimating(false);
  };

  const handleLocationClick = useCallback((point: Point) => {
    setSelectedLocation(point);
  }, []);

  const handleSetStart = () => {
    if (selectedLocation) {
      setStartPoint(selectedLocation);
      setSelectedLocation(null);
    }
  };

  const handleSetDestination = () => {
    if (selectedLocation) {
      setEndPoint(selectedLocation);
      setSelectedLocation(null);
    }
  };

  const handleZoomIn = useCallback(() => {
    transformRef.current?.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    transformRef.current?.zoomOut();
  }, []);

  const handleResetZoom = useCallback(() => {
    transformRef.current?.resetTransform();
  }, []);

  const handleConnectionPointClick = useCallback((point: ConnectionPoint) => {
    console.log('[IndoorNav] Connection point clicked:', point.name);
    handleLocationClick({
      floorId: currentFloor.id,
      x: point.x,
      y: point.y,
      name: point.name,
    });
  }, [currentFloor, handleLocationClick]);

  // Get current path segment for rendering
  const currentFloorPath = path.find(segment => segment.floorId === currentFloor?.id);

  // Get animated position
  let animatedPosition: { x: number; y: number } | null = null;
  if (currentFloorPath && animationProgress > 0 && animationProgress < 1) {
    const totalPoints = currentFloorPath.points.length;
    const pointIndex = Math.min(Math.floor(animationProgress * totalPoints), totalPoints - 1);
    animatedPosition = currentFloorPath.points[pointIndex];
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Floor Selector - Top Bar */}
      <div className="flex items-center justify-center gap-2 p-3 bg-white border-b shadow-sm z-20">
        {sortedFloors.map((floor, index) => (
          <button
            key={floor.id}
            onClick={() => goToFloor(index)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              currentFloorIndex === index
                ? "bg-blue-600 text-white shadow-md"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {index > 0 ? (
                <ArrowUp className="h-4 w-4" />
              ) : (
                <ArrowDown className="h-4 w-4 opacity-0" />
              )}
              {floor.name}
            </div>
          </button>
        ))}
      </div>

      {/* Map Display with Zoom/Pan */}
      <div className="flex-1 relative overflow-hidden bg-gray-100">
        <TransformWrapper
          ref={transformRef}
          initialScale={0.8}
          minScale={0.3}
          maxScale={4}
          centerOnInit={true}
          doubleClick={{ disabled: false, mode: "zoomIn" }}
          panning={{ disabled: false }}
          wheel={{ step: 0.1 }}
        >
          <TransformComponent
            wrapperClass="!w-full !h-full"
            contentClass="!w-full !h-full flex items-center justify-center"
          >
            <div ref={svgContainerRef} className="relative">
              {/* Base SVG Map */}
              <div
                className="relative bg-white"
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />

              {/* Overlay SVG for markers and paths */}
              {svgViewBox && (
                <svg
                  className="absolute top-0 left-0 w-full h-full pointer-events-none"
                  viewBox={svgViewBox}
                  style={{ pointerEvents: 'none' }}
                >
                  {/* Connection Points */}
                  {currentFloor?.connectionPoints.map((point) => (
                    <g
                      key={point.id}
                      style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                      onClick={() => handleConnectionPointClick(point)}
                    >
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={25}
                        fill={point.type === "elevator" ? "#3B82F6" : "#10B981"}
                        opacity={0.9}
                        stroke="white"
                        strokeWidth={5}
                      />
                      <text
                        x={point.x}
                        y={point.y + 8}
                        textAnchor="middle"
                        fill="white"
                        fontSize={24}
                        fontWeight="bold"
                        style={{ pointerEvents: 'none' }}
                      >
                        {point.type === "elevator" ? "↕" : "↗"}
                      </text>
                    </g>
                  ))}

                  {/* Path Line */}
                  {currentFloorPath && currentFloorPath.points.length > 1 && (
                    <polyline
                      points={currentFloorPath.points.map(p => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke="#EF4444"
                      strokeWidth={8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.8}
                    />
                  )}

                  {/* Start Marker */}
                  {startPoint && startPoint.floorId === currentFloor?.id && (
                    <circle
                      cx={startPoint.x}
                      cy={startPoint.y}
                      r={18}
                      fill="#10B981"
                      stroke="white"
                      strokeWidth={5}
                    />
                  )}

                  {/* End Marker */}
                  {endPoint && endPoint.floorId === currentFloor?.id && (
                    <circle
                      cx={endPoint.x}
                      cy={endPoint.y}
                      r={18}
                      fill="#EF4444"
                      stroke="white"
                      strokeWidth={5}
                    />
                  )}

                  {/* Animated Position Marker */}
                  {animatedPosition && (
                    <circle
                      cx={animatedPosition.x}
                      cy={animatedPosition.y}
                      r={12}
                      fill="#EF4444"
                      stroke="white"
                      strokeWidth={4}
                    />
                  )}
                </svg>
              )}
            </div>
          </TransformComponent>
        </TransformWrapper>

        {/* Map Controls */}
        <MapControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onReset={handleResetZoom}
        />

        {/* Bottom Controls Bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t shadow-lg p-3 z-10">
          <div className="flex items-center gap-3 max-w-4xl mx-auto">
            {/* Start/Destination Display */}
            <div className="flex-1 flex items-center gap-2 text-sm">
              {startPoint && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-100 rounded-lg">
                  <div className="h-2.5 w-2.5 rounded-full bg-green-600"></div>
                  <span className="font-medium text-green-800">{startPoint.name || 'Start'}</span>
                </div>
              )}
              {endPoint && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-100 rounded-lg">
                  <div className="h-4 w-4 text-red-600">📍</div>
                  <span className="font-medium text-red-800">{endPoint.name || 'Destination'}</span>
                </div>
              )}
              {!startPoint && !endPoint && (
                <span className="text-gray-500">Tap connection points to set route</span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {/* Accessibility Toggle */}
              <button
                onClick={() => onAccessibilityToggle?.(!accessibilityMode)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  accessibilityMode
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                title={accessibilityMode ? "Accessibility mode: Lifts only" : "Enable accessibility mode"}
              >
                <Accessibility className="h-4 w-4" />
              </button>

              {/* Animation Controls */}
              {path.length > 0 && (
                <>
                  <button
                    onClick={toggleAnimation}
                    className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    title={isAnimating ? "Pause" : "Play"}
                  >
                    {isAnimating ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={resetAnimation}
                    className="p-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
                    title="Reset"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <button
                    onClick={clearRoute}
                    className="px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors text-sm font-medium"
                  >
                    Clear Route
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          {path.length > 0 && animationProgress > 0 && (
            <div className="mt-2 max-w-4xl mx-auto">
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-100"
                  style={{ width: `${animationProgress * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Location Detail Modal */}
      {selectedLocation && (
        <div className="absolute inset-0 bg-black/40 z-30 flex items-end justify-center p-0 pointer-events-auto">
          <div className="w-full max-w-md rounded-t-3xl bg-white shadow-2xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{selectedLocation.name || 'Location'}</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {currentFloor.name}
                </p>
              </div>
              <button
                onClick={() => setSelectedLocation(null)}
                className="rounded-full bg-gray-100 p-2 hover:bg-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleSetStart}
                className="w-full rounded-full border-2 border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
              >
                <div className="flex items-center justify-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full border-2 border-green-500 bg-green-500"></div>
                  Set as Start
                </div>
              </button>
              <button
                onClick={handleSetDestination}
                className="w-full rounded-full border-2 border-blue-600 bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-all"
              >
                <div className="flex items-center justify-center gap-2">
                  📍 Set as Destination
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Pathfinding algorithm
function calculatePath(
  building: Building,
  start: { floorId: string; x: number; y: number },
  end: { floorId: string; x: number; y: number },
  accessibilityMode: boolean
): PathSegment[] {
  const segments: PathSegment[] = [];

  const startFloor = building.floors.find(f => f.id === start.floorId);
  const endFloor = building.floors.find(f => f.id === end.floorId);

  if (!startFloor || !endFloor) return segments;

  // Same floor - direct path
  if (start.floorId === end.floorId) {
    segments.push({
      floorId: start.floorId,
      points: [
        { x: start.x, y: start.y },
        { x: end.x, y: end.y },
      ],
    });
    return segments;
  }

  // Multi-floor navigation
  const availableConnections = startFloor.connectionPoints.filter(
    cp => cp.connectsToFloorId === end.floorId &&
          (!accessibilityMode || cp.isAccessible)
  );

  if (availableConnections.length === 0) {
    console.warn("No valid connection points found");
    return segments;
  }

  // Use closest connection point
  const connectionPoint = availableConnections.reduce((closest, current) => {
    const closestDist = Math.hypot(closest.x - start.x, closest.y - start.y);
    const currentDist = Math.hypot(current.x - start.x, current.y - start.y);
    return currentDist < closestDist ? current : closest;
  });

  // Path on start floor to connection point
  segments.push({
    floorId: start.floorId,
    points: [
      { x: start.x, y: start.y },
      { x: connectionPoint.x, y: connectionPoint.y },
    ],
    transition: {
      type: connectionPoint.type as "stairs" | "elevator",
      name: connectionPoint.name,
      toFloorId: end.floorId,
    },
  });

  // Path on end floor from connection point to destination
  segments.push({
    floorId: end.floorId,
    points: [
      { x: connectionPoint.x, y: connectionPoint.y },
      { x: end.x, y: end.y },
    ],
  });

  return segments;
}
