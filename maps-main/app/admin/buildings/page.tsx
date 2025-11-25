"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Building2, Plus, Edit, Trash2 } from 'lucide-react';

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
    connectionPoints: any[];
  }>;
  createdAt: string;
};

export default function BuildingsPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBuildings();
  }, []);

  const fetchBuildings = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/buildings');
      if (!res.ok) throw new Error('Failed to fetch buildings');
      const data = await res.json();
      setBuildings(data.buildings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch buildings');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this building? This will also delete all floors and connection points.')) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/buildings/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete building');

      setBuildings(buildings.filter(b => b.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete building');
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Building2 className="h-8 w-8 text-blue-600" />
            Indoor Maps Management
          </h1>
          <p className="text-gray-600 mt-2">
            Manage buildings with indoor navigation and floor maps
          </p>
        </div>
        <Link
          href="/admin/buildings/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-5 w-5" />
          Add Building
        </Link>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && buildings.length === 0 && (
        <div className="text-center py-12">
          <Building2 className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No buildings yet</h3>
          <p className="text-gray-600 mb-4">Get started by adding your first indoor map building</p>
          <Link
            href="/admin/buildings/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-5 w-5" />
            Add Building
          </Link>
        </div>
      )}

      {!loading && !error && buildings.length > 0 && (
        <div className="grid gap-4">
          {buildings.map((building) => (
            <div
              key={building.id}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {building.name}
                  </h3>
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>
                      <span className="font-medium">Connected Place:</span>{' '}
                      {building.Place.name}
                    </div>
                    <div>
                      <span className="font-medium">Floors:</span>{' '}
                      {building.floors.length}
                    </div>
                    <div>
                      <span className="font-medium">Connection Points:</span>{' '}
                      {building.floors.reduce((sum, floor) => sum + floor.connectionPoints.length, 0)}
                    </div>
                    <div>
                      <span className="font-medium">Created:</span>{' '}
                      {new Date(building.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/admin/buildings/${building.id}`}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit Building"
                  >
                    <Edit className="h-5 w-5" />
                  </Link>
                  <button
                    onClick={() => handleDelete(building.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete Building"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
