"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Building2, Plus, Edit, Trash2, MapPin } from 'lucide-react';

type Building = {
  id: string;
  name: string;
  placeId: string;
  Place: {
    id: string;
    name: string;
  };
  floors: Array<{
    id: string;
    name: string;
    floorNumber: number;
    svgPath: string;
    connectionPoints: Array<{
      id: string;
      name: string;
      type: string;
    }>;
  }>;
};

export default function EditBuildingPage() {
  const params = useParams();
  const router = useRouter();
  const buildingId = params.id as string;

  const [building, setBuilding] = useState<Building | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddFloor, setShowAddFloor] = useState(false);

  useEffect(() => {
    fetchBuilding();
  }, [buildingId]);

  const fetchBuilding = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/buildings/${buildingId}`);
      if (!res.ok) throw new Error('Failed to fetch building');
      const data = await res.json();
      setBuilding(data.building);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch building');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFloor = async (floorId: string) => {
    if (!confirm('Are you sure you want to delete this floor? This will also delete all connection points.')) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/floors/${floorId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete floor');

      fetchBuilding();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete floor');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-screen">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
      </div>
    );
  }

  if (error || !building) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error || 'Building not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <Link
        href="/admin/buildings"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Buildings
      </Link>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <Building2 className="h-7 w-7 text-blue-600" />
              {building.name}
            </h1>
            <p className="text-gray-600 mt-1">
              Connected to: <span className="font-medium">{building.Place.name}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Floors</h2>
          <button
            onClick={() => setShowAddFloor(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-5 w-5" />
            Add Floor
          </button>
        </div>

        {building.floors.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <p>No floors yet. Add your first floor to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {building.floors.map((floor) => (
              <div
                key={floor.id}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{floor.name}</h3>
                    <div className="text-sm text-gray-600 mt-1 space-y-1">
                      <div>Floor Number: {floor.floorNumber}</div>
                      <div>SVG: {floor.svgPath}</div>
                      <div>
                        Connection Points: {floor.connectionPoints.length}
                        {floor.connectionPoints.length > 0 && (
                          <span className="ml-2 text-xs">
                            ({floor.connectionPoints.map(cp => cp.type).join(', ')})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/admin/buildings/${buildingId}/floors/${floor.id}/editor`}
                      className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors flex items-center gap-1 text-sm font-medium"
                      title="Edit Connection Points"
                    >
                      <MapPin className="h-4 w-4" />
                      Editor
                    </Link>
                    <button
                      onClick={() => handleDeleteFloor(floor.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete Floor"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddFloor && (
        <AddFloorModal
          buildingId={buildingId}
          onClose={() => setShowAddFloor(false)}
          onSuccess={() => {
            setShowAddFloor(false);
            fetchBuilding();
          }}
        />
      )}
    </div>
  );
}

function AddFloorModal({
  buildingId,
  onClose,
  onSuccess,
}: {
  buildingId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [floorNumber, setFloorNumber] = useState('0');
  const [svgFile, setSvgFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!svgFile) {
      setError('Please select an SVG file');
      return;
    }

    try {
      setUploading(true);

      // Upload SVG file
      const formData = new FormData();
      formData.append('file', svgFile);

      const uploadRes = await fetch('/api/admin/upload-svg', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const data = await uploadRes.json();
        throw new Error(data.error || 'Failed to upload SVG');
      }

      const { svgPath } = await uploadRes.json();

      // Create floor
      const floorRes = await fetch(`/api/admin/buildings/${buildingId}/floors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          floorNumber: parseInt(floorNumber),
          svgPath,
        }),
      });

      if (!floorRes.ok) {
        const data = await floorRes.json();
        throw new Error(data.error || 'Failed to create floor');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add floor');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New Floor</h3>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Floor Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Ground Floor, Level 1"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Floor Number *
            </label>
            <input
              type="number"
              value={floorNumber}
              onChange={(e) => setFloorNumber(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="0 for ground, 1 for first floor, etc."
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              SVG Floor Plan *
            </label>
            <input
              type="file"
              accept=".svg"
              onChange={(e) => setSvgFile(e.target.files?.[0] || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              Upload an SVG file of the floor plan
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={uploading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? 'Adding...' : 'Add Floor'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
