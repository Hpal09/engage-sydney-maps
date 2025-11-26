"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, Edit2, Trash2, MapPin, DoorOpen, X, Check } from 'lucide-react';

interface Floor {
  id: string;
  name: string;
  floorNumber: number;
  svgPath: string;
}

interface Building {
  id: string;
  name: string;
  placeId: string;
  floors: Floor[];
  Place: {
    lat: number;
    lng: number;
  };
}

interface BuildingEntrance {
  id: string;
  buildingId: string;
  floorId: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  indoorX: number;
  indoorY: number;
  isAccessible: boolean;
  isOpen: boolean;
}

export default function BuildingEntrancesPage() {
  const params = useParams();
  const router = useRouter();
  const buildingId = params.id as string;

  const [building, setBuilding] = useState<Building | null>(null);
  const [entrances, setEntrances] = useState<BuildingEntrance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEntrance, setEditingEntrance] = useState<BuildingEntrance | null>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [isPickingGPS, setIsPickingGPS] = useState(false);
  const [isPickingIndoor, setIsPickingIndoor] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    type: 'main',
    floorId: '',
    lat: 0,
    lng: 0,
    indoorX: 0,
    indoorY: 0,
    isAccessible: true,
    isOpen: true,
  });

  useEffect(() => {
    fetchBuildingData();
    fetchEntrances();
  }, [buildingId]);

  async function fetchBuildingData() {
    try {
      const res = await fetch(`/api/admin/buildings/${buildingId}`);
      const data = await res.json();
      setBuilding(data.building);

      // Load SVG for ground floor
      if (data.building.floors.length > 0) {
        const groundFloor = data.building.floors.find((f: Floor) => f.floorNumber === 0) || data.building.floors[0];
        setFormData(prev => ({ ...prev, floorId: groundFloor.id }));

        if (groundFloor.svgPath) {
          const svgRes = await fetch(groundFloor.svgPath);
          const svgText = await svgRes.text();
          setSvgContent(svgText);
        }
      }
    } catch (error) {
      console.error('Error fetching building:', error);
    }
  }

  async function fetchEntrances() {
    try {
      const res = await fetch(`/api/admin/buildings/${buildingId}/entrances`);
      const data = await res.json();
      setEntrances(data.entrances || []);
    } catch (error) {
      console.error('Error fetching entrances:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      const url = editingEntrance
        ? `/api/admin/buildings/${buildingId}/entrances/${editingEntrance.id}`
        : `/api/admin/buildings/${buildingId}/entrances`;

      const res = await fetch(url, {
        method: editingEntrance ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        await fetchEntrances();
        resetForm();
      }
    } catch (error) {
      console.error('Error saving entrance:', error);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this entrance?')) return;

    try {
      const res = await fetch(`/api/admin/buildings/${buildingId}/entrances/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        await fetchEntrances();
      }
    } catch (error) {
      console.error('Error deleting entrance:', error);
    }
  }

  function handleEdit(entrance: BuildingEntrance) {
    setEditingEntrance(entrance);
    setFormData({
      name: entrance.name,
      type: entrance.type,
      floorId: entrance.floorId,
      lat: entrance.lat,
      lng: entrance.lng,
      indoorX: entrance.indoorX,
      indoorY: entrance.indoorY,
      isAccessible: entrance.isAccessible,
      isOpen: entrance.isOpen,
    });
    setShowForm(true);
  }

  function resetForm() {
    setShowForm(false);
    setEditingEntrance(null);
    setFormData({
      name: '',
      type: 'main',
      floorId: building?.floors[0]?.id || '',
      lat: building?.Place.lat || 0,
      lng: building?.Place.lng || 0,
      indoorX: 0,
      indoorY: 0,
      isAccessible: true,
      isOpen: true,
    });
    setIsPickingGPS(false);
    setIsPickingIndoor(false);
  }

  function handleSVGClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!isPickingIndoor) return;

    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;

    const x = ((e.clientX - rect.left) / rect.width) * viewBox.width;
    const y = ((e.clientY - rect.top) / rect.height) * viewBox.height;

    setFormData(prev => ({ ...prev, indoorX: x, indoorY: y }));
    setIsPickingIndoor(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="mb-4 text-blue-600 hover:text-blue-700"
          >
            ← Back to Buildings
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Building Entrances</h1>
          <p className="text-gray-600 mt-2">{building?.name}</p>
        </div>

        {/* Add New Button */}
        <div className="mb-6">
          <button
            onClick={() => {
              setShowForm(true);
              setFormData(prev => ({ ...prev, lat: building?.Place.lat || 0, lng: building?.Place.lng || 0 }));
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-5 h-5" />
            Add New Entrance
          </button>
        </div>

        {/* Entrances List */}
        <div className="bg-white rounded-lg shadow">
          <table className="w-full">
            <thead className="border-b">
              <tr>
                <th className="text-left p-4">Name</th>
                <th className="text-left p-4">Type</th>
                <th className="text-left p-4">GPS Coordinates</th>
                <th className="text-left p-4">Indoor Coordinates</th>
                <th className="text-left p-4">Status</th>
                <th className="text-right p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entrances.map(entrance => (
                <tr key={entrance.id} className="border-b hover:bg-gray-50">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <DoorOpen className="w-4 h-4 text-gray-400" />
                      {entrance.name}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      entrance.type === 'main' ? 'bg-blue-100 text-blue-700' :
                      entrance.type === 'accessible' ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {entrance.type}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-gray-600">
                    {entrance.lat.toFixed(6)}, {entrance.lng.toFixed(6)}
                  </td>
                  <td className="p-4 text-sm text-gray-600">
                    {entrance.indoorX.toFixed(1)}, {entrance.indoorY.toFixed(1)}
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      {entrance.isAccessible && (
                        <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">Accessible</span>
                      )}
                      {entrance.isOpen ? (
                        <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">Open</span>
                      ) : (
                        <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded">Closed</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleEdit(entrance)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(entrance.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {entrances.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    No entrances yet. Click &quot;Add New Entrance&quot; to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold">
                    {editingEntrance ? 'Edit Entrance' : 'Add New Entrance'}
                  </h2>
                  <button onClick={resetForm} className="p-2 hover:bg-gray-100 rounded">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Basic Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Entrance Name</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="Main Entrance - William Street"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Type</label>
                      <select
                        value={formData.type}
                        onChange={e => setFormData(prev => ({ ...prev, type: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        <option value="main">Main</option>
                        <option value="side">Side</option>
                        <option value="accessible">Accessible</option>
                        <option value="emergency">Emergency</option>
                      </select>
                    </div>
                  </div>

                  {/* Floor Selection */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Floor</label>
                    <select
                      value={formData.floorId}
                      onChange={e => setFormData(prev => ({ ...prev, floorId: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg"
                      required
                    >
                      {building?.floors.map(floor => (
                        <option key={floor.id} value={floor.id}>{floor.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* GPS Coordinates */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Outdoor GPS Coordinates</label>
                    <div className="grid grid-cols-3 gap-4">
                      <input
                        type="number"
                        step="0.000001"
                        value={formData.lat}
                        onChange={e => setFormData(prev => ({ ...prev, lat: parseFloat(e.target.value) }))}
                        placeholder="Latitude"
                        className="px-3 py-2 border rounded-lg"
                        required
                      />
                      <input
                        type="number"
                        step="0.000001"
                        value={formData.lng}
                        onChange={e => setFormData(prev => ({ ...prev, lng: parseFloat(e.target.value) }))}
                        placeholder="Longitude"
                        className="px-3 py-2 border rounded-lg"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setIsPickingGPS(!isPickingGPS)}
                        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg ${
                          isPickingGPS ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
                        }`}
                      >
                        <MapPin className="w-4 h-4" />
                        {isPickingGPS ? 'Picking...' : 'Pick on Map'}
                      </button>
                    </div>
                  </div>

                  {/* Indoor Coordinates */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Indoor SVG Coordinates</label>
                    <div className="grid grid-cols-3 gap-4">
                      <input
                        type="number"
                        step="0.1"
                        value={formData.indoorX}
                        onChange={e => setFormData(prev => ({ ...prev, indoorX: parseFloat(e.target.value) }))}
                        placeholder="X"
                        className="px-3 py-2 border rounded-lg"
                        required
                      />
                      <input
                        type="number"
                        step="0.1"
                        value={formData.indoorY}
                        onChange={e => setFormData(prev => ({ ...prev, indoorY: parseFloat(e.target.value) }))}
                        placeholder="Y"
                        className="px-3 py-2 border rounded-lg"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setIsPickingIndoor(!isPickingIndoor)}
                        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg ${
                          isPickingIndoor ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
                        }`}
                      >
                        <MapPin className="w-4 h-4" />
                        {isPickingIndoor ? 'Click SVG' : 'Pick on SVG'}
                      </button>
                    </div>
                  </div>

                  {/* SVG Preview for Indoor Coordinate Picking */}
                  {isPickingIndoor && svgContent && (
                    <div className="border rounded-lg p-4 bg-gray-50">
                      <p className="text-sm text-gray-600 mb-2">Click on the SVG to set indoor coordinates:</p>
                      <div className="bg-white border rounded overflow-auto" style={{ maxHeight: '400px' }}>
                        <svg
                          dangerouslySetInnerHTML={{ __html: svgContent }}
                          onClick={handleSVGClick}
                          className="cursor-crosshair w-full h-auto"
                          style={{ maxWidth: '100%' }}
                        />
                      </div>
                      {formData.indoorX > 0 && formData.indoorY > 0 && (
                        <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
                          <Check className="w-4 h-4" />
                          Selected: ({formData.indoorX.toFixed(1)}, {formData.indoorY.toFixed(1)})
                        </div>
                      )}
                    </div>
                  )}

                  {/* Checkboxes */}
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.isAccessible}
                        onChange={e => setFormData(prev => ({ ...prev, isAccessible: e.target.checked }))}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Wheelchair Accessible</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.isOpen}
                        onChange={e => setFormData(prev => ({ ...prev, isOpen: e.target.checked }))}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Currently Open</span>
                    </label>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <button
                      type="button"
                      onClick={resetForm}
                      className="px-6 py-2 border rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      {editingEntrance ? 'Update' : 'Create'} Entrance
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
