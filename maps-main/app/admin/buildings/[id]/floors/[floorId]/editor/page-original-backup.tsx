"use client";

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Save, MapPin } from 'lucide-react';

type Floor = {
  id: string;
  name: string;
  floorNumber: number;
  svgPath: string;
  Building: {
    id: string;
    name: string;
    floors: Array<{
      id: string;
      name: string;
    }>;
  };
  connectionPoints: Array<{
    id: string;
    type: string;
    name: string;
    x: number;
    y: number;
    connectsToFloorId: string | null;
    isAccessible: boolean;
  }>;
};

export default function FloorEditorPage() {
  const params = useParams();
  const buildingId = params.id as string;
  const floorId = params.floorId as string;

  const svgRef = useRef<SVGSVGElement>(null);
  const [floor, setFloor] = useState<Floor | null>(null);
  const [svgContent, setSvgContent] = useState('');
  const [viewBox, setViewBox] = useState({ minX: 0, minY: 0, width: 1000, height: 1000 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPoint, setNewPoint] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    fetchFloor();
  }, [floorId]);

  const fetchFloor = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/floors/${floorId}`);
      if (!res.ok) throw new Error('Failed to fetch floor');
      const data = await res.json();
      setFloor(data.floor);

      // Load SVG content
      const svgRes = await fetch(data.floor.svgPath);
      if (!svgRes.ok) throw new Error('Failed to load SVG');
      const svgText = await svgRes.text();

      // Extract viewBox
      const viewBoxMatch = svgText.match(/viewBox\s*=\s*"([^"]+)"/i);
      if (viewBoxMatch) {
        const parts = viewBoxMatch[1].trim().split(/\s+/).map(Number);
        if (parts.length === 4) {
          setViewBox({ minX: parts[0], minY: parts[1], width: parts[2], height: parts[3] });
        }
      }

      // Extract SVG inner content
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
      const svgElement = svgDoc.querySelector('svg');
      if (svgElement) {
        const innerHTML = Array.from(svgElement.children)
          .map(child => new XMLSerializer().serializeToString(child))
          .join('');
        setSvgContent(innerHTML);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load floor');
    } finally {
      setLoading(false);
    }
  };

  const handleSVGClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;

    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();

    // Calculate click position relative to SVG
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert to SVG coordinates
    const svgX = (x / rect.width) * viewBox.width + viewBox.minX;
    const svgY = (y / rect.height) * viewBox.height + viewBox.minY;

    setNewPoint({ x: svgX, y: svgY });
    setShowAddForm(true);
  };

  const handleAddPoint = async (formData: {
    type: string;
    name: string;
    connectsToFloorId: string | null;
    isAccessible: boolean;
  }) => {
    if (!newPoint) return;

    try {
      const res = await fetch(`/api/admin/floors/${floorId}/connection-points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          x: newPoint.x,
          y: newPoint.y,
        }),
      });

      if (!res.ok) throw new Error('Failed to add connection point');

      setNewPoint(null);
      setShowAddForm(false);
      fetchFloor();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add connection point');
    }
  };

  const handleDeletePoint = async (pointId: string) => {
    if (!confirm('Delete this connection point?')) return;

    try {
      const res = await fetch(`/api/admin/connection-points/${pointId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete connection point');

      fetchFloor();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete connection point');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-screen">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
      </div>
    );
  }

  if (error || !floor) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error || 'Floor not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <Link
        href={`/admin/buildings/${buildingId}`}
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Building
      </Link>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {floor.Building.name} - {floor.name}
        </h1>
        <p className="text-gray-600">
          Click on the map to add connection points (stairs, elevators, etc.)
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SVG Editor */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="bg-gray-100 rounded-lg overflow-hidden" style={{ minHeight: '500px' }}>
              <svg
                ref={svgRef}
                viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
                className="w-full h-full cursor-crosshair"
                onClick={handleSVGClick}
              >
                {/* Floor plan */}
                <g dangerouslySetInnerHTML={{ __html: svgContent }} />

                {/* Connection points */}
                {floor.connectionPoints.map((point) => (
                  <g key={point.id}>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={12}
                      fill={point.type === 'elevator' ? '#8b5cf6' : '#3b82f6'}
                      opacity={selectedPoint === point.id ? 1 : 0.8}
                      stroke="white"
                      strokeWidth={2}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPoint(point.id);
                      }}
                      className="cursor-pointer hover:opacity-100 transition-opacity"
                    />
                    <text
                      x={point.x}
                      y={point.y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="white"
                      fontSize="10"
                      fontWeight="bold"
                      pointerEvents="none"
                    >
                      {point.type === 'elevator' ? 'E' : 'S'}
                    </text>
                  </g>
                ))}

                {/* Preview new point */}
                {newPoint && (
                  <circle
                    cx={newPoint.x}
                    cy={newPoint.y}
                    r={12}
                    fill="#10b981"
                    opacity={0.7}
                    stroke="white"
                    strokeWidth={2}
                  />
                )}
              </svg>
            </div>
          </div>
        </div>

        {/* Connection Points List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-4">Connection Points</h3>

            {floor.connectionPoints.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                Click on the map to add connection points
              </p>
            ) : (
              <div className="space-y-2">
                {floor.connectionPoints.map((point) => (
                  <div
                    key={point.id}
                    className={`p-3 rounded-lg border-2 transition-all cursor-pointer ${
                      selectedPoint === point.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedPoint(point.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-sm text-gray-900">{point.name}</div>
                        <div className="text-xs text-gray-600 mt-1">
                          Type: {point.type === 'elevator' ? 'Elevator' : 'Stairs'}
                        </div>
                        <div className="text-xs text-gray-500">
                          Position: ({Math.round(point.x)}, {Math.round(point.y)})
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePoint(point.id);
                        }}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Point Modal */}
      {showAddForm && newPoint && (
        <AddPointForm
          floor={floor}
          position={newPoint}
          onSubmit={handleAddPoint}
          onCancel={() => {
            setNewPoint(null);
            setShowAddForm(false);
          }}
        />
      )}
    </div>
  );
}

function AddPointForm({
  floor,
  position,
  onSubmit,
  onCancel,
}: {
  floor: Floor;
  position: { x: number; y: number };
  onSubmit: (data: any) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState('stairs');
  const [name, setName] = useState('');
  const [connectsToFloorId, setConnectsToFloorId] = useState<string>('');
  const [isAccessible, setIsAccessible] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      type,
      name: name.trim(),
      connectsToFloorId: connectsToFloorId || null,
      isAccessible: type === 'elevator' ? true : isAccessible,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Add Connection Point
        </h3>

        <div className="mb-4 p-3 bg-gray-50 rounded text-sm text-gray-600">
          Position: ({Math.round(position.x)}, {Math.round(position.y)})
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type *
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              required
            >
              <option value="stairs">Stairs</option>
              <option value="elevator">Elevator</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="e.g., Stair 1 West, Elevator 2"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Connects to Floor (optional)
            </label>
            <select
              value={connectsToFloorId}
              onChange={(e) => setConnectsToFloorId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">-- None --</option>
              {(floor.Building.floors || [])
                .filter(f => f.id !== floor.id)
                .map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
            </select>
          </div>

          {type === 'stairs' && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="accessible"
                checked={isAccessible}
                onChange={(e) => setIsAccessible(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="accessible" className="text-sm text-gray-700">
                Wheelchair accessible
              </label>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add Point
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
