"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Deal, Place } from "@prisma/client";

interface DealFormProps {
  deal?: Deal;
  places: Pick<Place, "id" | "name">[];
  mode: "create" | "edit";
}

export default function DealForm({ deal, places, mode }: DealFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Format datetime for datetime-local input
  const formatDateTime = (date: Date | null) => {
    if (!date) return "";
    const d = new Date(date);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [formData, setFormData] = useState({
    placeId: deal?.placeId || "",
    title: deal?.title || "",
    description: deal?.description || "",
    startsAt: formatDateTime(deal?.startsAt || null),
    endsAt: formatDateTime(deal?.endsAt || null),
    tags: deal?.tags?.join(", ") || "",
    isLive: deal?.isLive ?? true,
  });

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.placeId || !formData.title || !formData.startsAt || !formData.endsAt) {
        setError("Please fill in all required fields");
        setLoading(false);
        return;
      }

      // Parse tags
      const tags = formData.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      const payload = {
        placeId: formData.placeId,
        title: formData.title,
        description: formData.description || null,
        startsAt: new Date(formData.startsAt).toISOString(),
        endsAt: new Date(formData.endsAt).toISOString(),
        tags,
        isLive: formData.isLive,
      };

      const url =
        mode === "create"
          ? "/api/admin/deals"
          : `/api/admin/deals/${deal?.id}`;

      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save deal");
      }

      router.push("/admin/deals");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "An error occurred");
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!deal?.id) return;

    if (!confirm("Are you sure you want to delete this deal?")) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/deals/${deal.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete deal");
      }

      router.push("/admin/deals");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "An error occurred");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Place */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Place <span className="text-red-500">*</span>
          </label>
          <select
            name="placeId"
            value={formData.placeId}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="">Select a place</option>
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        </div>

        {/* Title */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., Happy Hour - 50% off drinks"
            required
          />
        </div>

        {/* Description */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Describe the deal..."
          />
        </div>

        {/* Starts At */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Starts At <span className="text-red-500">*</span>
          </label>
          <input
            type="datetime-local"
            name="startsAt"
            value={formData.startsAt}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        {/* Ends At */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ends At <span className="text-red-500">*</span>
          </label>
          <input
            type="datetime-local"
            name="endsAt"
            value={formData.endsAt}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        {/* Tags */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tags (comma-separated)
          </label>
          <input
            type="text"
            name="tags"
            value={formData.tags}
            onChange={handleChange}
            placeholder="e.g., happy-hour, drinks, discount"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Live Status */}
        <div className="md:col-span-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              name="isLive"
              checked={formData.isLive}
              onChange={handleChange}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="ml-2 text-sm text-gray-700">
              Publish this deal (make it visible)
            </span>
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-6 border-t">
        <div>
          {mode === "edit" && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Delete Deal
            </button>
          )}
        </div>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? "Saving..." : mode === "create" ? "Create Deal" : "Update Deal"}
          </button>
        </div>
      </div>
    </form>
  );
}
