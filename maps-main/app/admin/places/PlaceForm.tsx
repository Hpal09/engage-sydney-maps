"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Place } from "@prisma/client";
import { PLACE_CATEGORIES } from "@/lib/categories";

const PRICE_RANGES = ["$", "$$", "$$$", "$$$$"];

interface PlaceFormProps {
  place?: Place;
  mode: "create" | "edit";
}

export default function PlaceForm({ place, mode }: PlaceFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    name: place?.name || "",
    category: place?.category || "",
    shortDescription: place?.shortDescription || "",
    fullDescription: place?.fullDescription || "",
    address: place?.address || "",
    lat: place?.lat?.toString() || "",
    lng: place?.lng?.toString() || "",
    phone: place?.phone || "",
    websiteUrl: place?.websiteUrl || "",
    openingHours: place?.openingHours || "",
    priceRange: place?.priceRange || "",
    tags: place?.tags?.join(", ") || "",
    isLive: place?.isLive ?? true,
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
      if (!formData.name || !formData.category || !formData.lat || !formData.lng) {
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
        name: formData.name,
        category: formData.category,
        shortDescription: formData.shortDescription || null,
        fullDescription: formData.fullDescription || null,
        address: formData.address || null,
        lat: parseFloat(formData.lat),
        lng: parseFloat(formData.lng),
        phone: formData.phone || null,
        websiteUrl: formData.websiteUrl || null,
        openingHours: formData.openingHours || null,
        priceRange: formData.priceRange || null,
        tags,
        isLive: formData.isLive,
      };

      const url =
        mode === "create"
          ? "/api/admin/places"
          : `/api/admin/places/${place?.id}`;

      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save place");
      }

      router.push("/admin/places");
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
        {/* Name */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Category <span className="text-red-500">*</span>
          </label>
          <select
            name="category"
            value={formData.category}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="">Select category</option>
            {PLACE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Price Range */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Price Range
          </label>
          <select
            name="priceRange"
            value={formData.priceRange}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select price range</option>
            {PRICE_RANGES.map((price) => (
              <option key={price} value={price}>
                {price}
              </option>
            ))}
          </select>
        </div>

        {/* Short Description */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Short Description
          </label>
          <textarea
            name="shortDescription"
            value={formData.shortDescription}
            onChange={handleChange}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Full Description */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Full Description
          </label>
          <textarea
            name="fullDescription"
            value={formData.fullDescription}
            onChange={handleChange}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Address */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Address
          </label>
          <input
            type="text"
            name="address"
            value={formData.address}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Latitude */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Latitude <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="any"
            name="lat"
            value={formData.lat}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        {/* Longitude */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Longitude <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="any"
            name="lng"
            value={formData.lng}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phone
          </label>
          <input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Website URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Website URL
          </label>
          <input
            type="url"
            name="websiteUrl"
            value={formData.websiteUrl}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Opening Hours */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Opening Hours
          </label>
          <input
            type="text"
            name="openingHours"
            value={formData.openingHours}
            onChange={handleChange}
            placeholder="e.g., Mon-Fri: 9am-5pm"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            placeholder="e.g., coffee, breakfast, wifi"
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
              Publish this place (make it visible on the map)
            </span>
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-4 pt-6 border-t">
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
          {loading ? "Saving..." : mode === "create" ? "Create Place" : "Update Place"}
        </button>
      </div>
    </form>
  );
}
