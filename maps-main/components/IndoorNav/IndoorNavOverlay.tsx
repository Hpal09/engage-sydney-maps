"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import IndoorMapViewer from "./IndoorMapViewer";

type Props = {
  placeId: string;
  placeName: string;
  onClose: () => void;
};

type Building = {
  id: string;
  name: string;
  floors: Array<{
    id: string;
    name: string;
    floorNumber: number;
    svgPath: string;
    connectionPoints: Array<{
      id: string;
      type: string;
      name: string;
      x: number;
      y: number;
      connectsToFloorId: string | null;
      isAccessible: boolean;
    }>;
  }>;
};

export default function IndoorNavOverlay({ placeId, placeName, onClose }: Props) {
  const [building, setBuilding] = useState<Building | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessibilityMode, setAccessibilityMode] = useState(false);

  useEffect(() => {
    fetchBuildingData();
  }, [placeId]);

  const fetchBuildingData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/indoor-nav/${placeId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch building data");
      }

      const data = await response.json();
      setBuilding(data.building);
    } catch (err) {
      console.error("Error fetching building data:", err);
      setError("Failed to load indoor navigation. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-white">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-white border-b shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Indoor Navigation</h1>
          <p className="text-sm text-gray-600">{placeName}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full bg-gray-100 p-2 hover:bg-gray-200 transition-colors"
          aria-label="Close"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Content */}
      <div className="h-full pt-20">
        {loading && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
              <p className="text-gray-600">Loading indoor map...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mb-4 text-6xl">⚠️</div>
              <p className="text-red-600 font-medium">{error}</p>
              <button
                onClick={fetchBuildingData}
                className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {!loading && !error && building && (
          <IndoorMapViewer
            building={building}
            accessibilityMode={accessibilityMode}
            onAccessibilityToggle={setAccessibilityMode}
          />
        )}

        {!loading && !error && !building && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mb-4 text-6xl">🏛️</div>
              <p className="text-gray-600">Indoor navigation not available for this location.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
