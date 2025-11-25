"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Building2 } from 'lucide-react';

type Place = {
  id: string;
  name: string;
  category: string;
};

export default function NewBuildingPage() {
  const router = useRouter();
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState('');
  const [buildingName, setBuildingName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPlaces();
  }, []);

  const fetchPlaces = async () => {
    try {
      const res = await fetch('/api/places');
      if (!res.ok) throw new Error('Failed to fetch places');
      const data = await res.json();
      setPlaces(data);
    } catch (err) {
      console.error('Error fetching places:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedPlaceId || !buildingName.trim()) {
      setError('Please select a place and enter a building name');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/admin/buildings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: selectedPlaceId,
          name: buildingName.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create building');
      }

      const { building } = await res.json();
      router.push(`/admin/buildings/${building.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create building');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Link
        href="/admin/buildings"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Buildings
      </Link>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-3">
          <Building2 className="h-7 w-7 text-blue-600" />
          Add New Building
        </h1>
        <p className="text-gray-600 mb-6">
          Create a new building with indoor navigation
        </p>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="place" className="block text-sm font-medium text-gray-700 mb-2">
              Select Place *
            </label>
            <select
              id="place"
              value={selectedPlaceId}
              onChange={(e) => {
                setSelectedPlaceId(e.target.value);
                const place = places.find(p => p.id === e.target.value);
                if (place && !buildingName) {
                  setBuildingName(place.name);
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="">-- Select a place --</option>
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name} ({place.category})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Choose the POI on the Sydney map that this building represents
            </p>
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Building Name *
            </label>
            <input
              type="text"
              id="name"
              value={buildingName}
              onChange={(e) => setBuildingName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Museum of Sydney"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              This will appear in the indoor navigation UI
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Building'}
            </button>
            <Link
              href="/admin/buildings"
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
