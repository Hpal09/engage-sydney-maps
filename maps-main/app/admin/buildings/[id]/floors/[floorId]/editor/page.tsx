"use client";

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2, MapPin, Store } from 'lucide-react';

type IndoorPOI = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  x: number;
  y: number;
  svgElementId: string | null;
  hours: string | null;
  priceRange: string | null;
  imageUrl: string | null;
  website: string | null;
  phone: string | null;
  tags: string[];
  isLive: boolean;
};

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
  indoorPOIs: IndoorPOI[];
};

type EditorMode = 'connections' | 'pois';

export default function FloorEditorEnhanced() {
  const params = useParams();
  const buildingId = params.id as string;
  const floorId = params.floorId as string;

  const svgRef = useRef<SVGSVGElement>(null);
  const [floor, setFloor] = useState<Floor | null>(null);
  const [svgContent, setSvgContent] = useState('');
  const [viewBox, setViewBox] = useState({ minX: 0, minY: 0, width: 1000, height: 1000 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>('connections');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPoint, setNewPoint] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    fetchFloor();
  }, [floorId]);

  // Highlight POI elements in the SVG
  useEffect(() => {
    if (!svgRef.current || !floor || mode !== 'pois') return;

    // Reset all elements first
    const allElements = svgRef.current.querySelectorAll('[data-poi-highlight]');
    allElements.forEach(el => {
      el.removeAttribute('data-poi-highlight');
      el.removeAttribute('style');
    });

    // Highlight POI elements
    floor.indoorPOIs.forEach((poi) => {
      if (!poi.svgElementId) return;

      const element = svgRef.current?.querySelector(`#${CSS.escape(poi.svgElementId)}`);
      if (!element) return;

      // Add highlight
      element.setAttribute('data-poi-highlight', 'true');
      const isSelected = selectedItemId === poi.id;
      element.setAttribute('style', `
        fill: ${isSelected ? '#a855f7' : '#10b981'};
        fill-opacity: ${isSelected ? '0.6' : '0.4'};
        stroke: ${isSelected ? '#9333ea' : '#059669'};
        stroke-width: 2;
        cursor: pointer;
        transition: all 0.2s;
      `);

      // Add click handler
      const handleClick = (e: Event) => {
        e.stopPropagation();
        setSelectedItemId(poi.id);
      };
      element.addEventListener('click', handleClick);
    });

    return () => {
      // Cleanup
      const allElements = svgRef.current?.querySelectorAll('[data-poi-highlight]');
      allElements?.forEach(el => {
        el.removeAttribute('data-poi-highlight');
        el.removeAttribute('style');
      });
    };
  }, [floor, mode, selectedItemId]);

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

    // For POI mode, detect which SVG element was clicked
    if (mode === 'pois') {
      const target = e.target as SVGElement;

      // Check if clicked element has an ID
      let clickedElement: Element = target;
      let elementId = clickedElement.id;

      // If no ID, check parent elements up to 3 levels
      if (!elementId && clickedElement.parentElement) {
        clickedElement = clickedElement.parentElement;
        elementId = clickedElement.id;
      }
      if (!elementId && clickedElement.parentElement) {
        clickedElement = clickedElement.parentElement;
        elementId = clickedElement.id;
      }

      if (elementId && elementId !== 'svg-content' && elementId !== 'inline-svg-content') {
        // Found an element with ID - use it for POI
        try {
          // Get bounding box of the clicked element
          const bbox = (clickedElement as SVGGraphicsElement).getBBox();
          const centerX = bbox.x + bbox.width / 2;
          const centerY = bbox.y + bbox.height / 2;

          setNewPoint({
            x: centerX,
            y: centerY,
            svgElementId: elementId,
            elementName: elementId.replace(/_/g, ' ').replace(/-/g, ' ')
          } as any);
          setShowAddForm(true);
          return;
        } catch (err) {
          console.error('Error getting bbox:', err);
        }
      }
    }

    // Default behavior for connections or if no element ID found
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();

    // Calculate click position relative to SVG
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert to SVG coordinates
    const svgX = (x / rect.width) * viewBox.width + viewBox.minX;
    const svgY = (y / rect.height) * viewBox.height + viewBox.minY;

    setNewPoint({ x: svgX, y: svgY } as any);
    setShowAddForm(true);
  };

  const handleDeleteConnection = async (id: string) => {
    if (!confirm('Delete this connection point?')) return;
    try {
      const res = await fetch(`/api/admin/connection-points/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      fetchFloor();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleDeletePOI = async (id: string) => {
    if (!confirm('Delete this POI?')) return;
    try {
      const res = await fetch(`/api/admin/indoor-pois/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      fetchFloor();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
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
        <p className="text-gray-600 mb-4">
          {mode === 'connections'
            ? 'Click on the map to add connection points (stairs, elevators)'
            : 'Click on the map to add POIs (rooms, shops, galleries)'}
        </p>

        {/* Mode Switcher */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode('connections')}
            className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
              mode === 'connections'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <MapPin className="h-4 w-4" />
            Connections ({floor.connectionPoints.length})
          </button>
          <button
            onClick={() => setMode('pois')}
            className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
              mode === 'pois'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Store className="h-4 w-4" />
            Indoor POIs ({floor.indoorPOIs.length})
          </button>
        </div>
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
                {mode === 'connections' && floor.connectionPoints.map((point) => (
                  <g key={point.id}>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={12}
                      fill={point.type === 'elevator' ? '#8b5cf6' : '#3b82f6'}
                      opacity={selectedItemId === point.id ? 1 : 0.8}
                      stroke="white"
                      strokeWidth={2}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedItemId(point.id);
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

                {/* POI elements are highlighted directly in the SVG via useEffect */}

                {/* Preview new point */}
                {newPoint && (
                  <circle
                    cx={newPoint.x}
                    cy={newPoint.y}
                    r={mode === 'connections' ? 12 : 15}
                    fill={mode === 'connections' ? '#3b82f6' : '#10b981'}
                    opacity={0.7}
                    stroke="white"
                    strokeWidth={2}
                  />
                )}
              </svg>
            </div>
          </div>
        </div>

        {/* Items List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-4">
              {mode === 'connections' ? 'Connection Points' : 'Indoor POIs'}
            </h3>

            {mode === 'connections' && floor.connectionPoints.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">
                Click on the map to add connection points
              </p>
            )}

            {mode === 'connections' && floor.connectionPoints.length > 0 && (
              <div className="space-y-2">
                {floor.connectionPoints.map((point) => (
                  <div
                    key={point.id}
                    className={`p-3 rounded-lg border-2 transition-all cursor-pointer ${
                      selectedItemId === point.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedItemId(point.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-sm text-gray-900">{point.name}</div>
                        <div className="text-xs text-gray-600 mt-1">
                          {point.type === 'elevator' ? 'Elevator' : 'Stairs'}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConnection(point.id);
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

            {mode === 'pois' && floor.indoorPOIs.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">
                Click on the map to add POIs
              </p>
            )}

            {mode === 'pois' && floor.indoorPOIs.length > 0 && (
              <div className="space-y-2">
                {floor.indoorPOIs.map((poi) => (
                  <div
                    key={poi.id}
                    className={`p-3 rounded-lg border-2 transition-all cursor-pointer ${
                      selectedItemId === poi.id
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedItemId(poi.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-sm text-gray-900">{poi.name}</div>
                        {poi.category && (
                          <div className="text-xs text-gray-600 mt-1">{poi.category}</div>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePOI(poi.id);
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

      {/* Add Form Modal */}
      {showAddForm && newPoint && mode === 'connections' && (
        <AddConnectionForm
          floor={floor}
          position={newPoint}
          onSubmit={async (data) => {
            try {
              const res = await fetch(`/api/admin/floors/${floorId}/connection-points`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...data, x: newPoint.x, y: newPoint.y }),
              });
              if (!res.ok) throw new Error('Failed to add');
              setNewPoint(null);
              setShowAddForm(false);
              fetchFloor();
            } catch (err) {
              alert(err instanceof Error ? err.message : 'Failed to add');
            }
          }}
          onCancel={() => {
            setNewPoint(null);
            setShowAddForm(false);
          }}
        />
      )}

      {showAddForm && newPoint && mode === 'pois' && (
        <AddPOIForm
          position={newPoint}
          onSubmit={async (data) => {
            try {
              const res = await fetch(`/api/admin/floors/${floorId}/indoor-pois`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...data, x: newPoint.x, y: newPoint.y }),
              });
              if (!res.ok) throw new Error('Failed to add');
              setNewPoint(null);
              setShowAddForm(false);
              fetchFloor();
            } catch (err) {
              alert(err instanceof Error ? err.message : 'Failed to add');
            }
          }}
          onCancel={() => {
            setNewPoint(null);
            setShowAddForm(false);
          }}
        />
      )}
    </div>
  );
}

// Connection Point Form (existing)
function AddConnectionForm({
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Add Connection Point
        </h3>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit({ type, name, connectsToFloorId: connectsToFloorId || null, isAccessible }); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type *</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" required>
              <option value="stairs">Stairs</option>
              <option value="elevator">Elevator</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="e.g., Stair 1 West" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Connects to Floor</label>
            <select value={connectsToFloorId} onChange={(e) => setConnectsToFloorId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
              <option value="">-- None --</option>
              {(floor.Building.floors || []).filter(f => f.id !== floor.id).map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          {type === 'stairs' && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="accessible" checked={isAccessible} onChange={(e) => setIsAccessible(e.target.checked)} />
              <label htmlFor="accessible" className="text-sm text-gray-700">Wheelchair accessible</label>
            </div>
          )}
          <div className="flex gap-3 pt-4">
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Add Point</button>
            <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// NEW: Indoor POI Form
function AddPOIForm({
  position,
  onSubmit,
  onCancel,
}: {
  position: { x: number; y: number; svgElementId?: string; elementName?: string };
  onSubmit: (data: any) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(position.elementName || '');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState('');
  const [priceRange, setPriceRange] = useState('');
  const [website, setWebsite] = useState('');
  const [phone, setPhone] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 my-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Add Indoor POI
          {position.svgElementId && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              (SVG: {position.svgElementId})
            </span>
          )}
        </h3>
        <form onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            name,
            category: category || null,
            description: description || null,
            hours: hours || null,
            priceRange: priceRange || null,
            website: website || null,
            phone: phone || null,
            svgElementId: position.svgElementId || null
          });
        }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="e.g., Egyptian Gallery, Nike Store" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option value="">-- Select --</option>
                <option value="Restaurant">Restaurant</option>
                <option value="Shop">Shop</option>
                <option value="Gallery">Gallery</option>
                <option value="Restroom">Restroom</option>
                <option value="Office">Office</option>
                <option value="Meeting Room">Meeting Room</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Price Range</label>
              <select value={priceRange} onChange={(e) => setPriceRange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option value="">-- Select --</option>
                <option value="$">$ (Budget)</option>
                <option value="$$">$$ (Moderate)</option>
                <option value="$$$">$$$ (Expensive)</option>
                <option value="$$$$">$$$$ (Luxury)</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" rows={3} placeholder="Brief description..."></textarea>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Opening Hours</label>
              <input type="text" value={hours} onChange={(e) => setHours(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="e.g., 9 AM - 5 PM" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="e.g., (02) 1234 5678" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Website</label>
              <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="https://..." />
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <button type="submit" className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Add POI</button>
            <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
