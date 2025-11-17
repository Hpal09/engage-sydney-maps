"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Place, Event } from "@prisma/client";

type EventWithPlace = Event & {
  place?: Pick<Place, "name"> | null;
};

interface EventFormProps {
  event?: EventWithPlace | null;
  places: Pick<Place, "id" | "name">[];
}

export default function EventForm({ event, places }: EventFormProps) {
  const router = useRouter();
  const isEditMode = !!event;

  const formatDateTime = (date: Date | null | undefined) => {
    if (!date) return "";
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const [formData, setFormData] = useState({
    placeId: event?.placeId || "",
    title: event?.title || "",
    description: event?.description || "",
    category: event?.category || "other",
    startsAt: formatDateTime(event?.startsAt || null),
    endsAt: formatDateTime(event?.endsAt || null),
    tags: event?.tags?.join(", ") || "",
    isLive: event?.isLive ?? true,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const tagsArray = formData.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const payload = {
        placeId: formData.placeId || null,
        title: formData.title,
        description: formData.description || null,
        category: formData.category,
        startsAt: formData.startsAt,
        endsAt: formData.endsAt,
        tags: tagsArray,
        isLive: formData.isLive,
      };

      const url = isEditMode
        ? `/api/admin/events/${event.id}`
        : "/api/admin/events";
      const method = isEditMode ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save event");
      }

      router.push("/admin/events");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "An error occurred");
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!event) return;
    if (!confirm("Are you sure you want to delete this event?")) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete event");
      }

      router.push("/admin/events");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "An error occurred");
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Place Selection (Optional) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Location (Optional)
        </label>
        <select
          name="placeId"
          value={formData.placeId}
          onChange={handleChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Area-wide Event</option>
          {places.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          Leave blank for area-wide events not tied to a specific place
        </p>
      </div>

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Title *
        </label>
        <input
          type="text"
          name="title"
          value={formData.title}
          onChange={handleChange}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Category *
        </label>
        <select
          name="category"
          value={formData.category}
          onChange={handleChange}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="live-music">Live Music</option>
          <option value="food">Food</option>
          <option value="market">Market</option>
          <option value="experience">Experience</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Start Date/Time */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Starts At *
        </label>
        <input
          type="datetime-local"
          name="startsAt"
          value={formData.startsAt}
          onChange={handleChange}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* End Date/Time */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Ends At *
        </label>
        <input
          type="datetime-local"
          name="endsAt"
          value={formData.endsAt}
          onChange={handleChange}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Tags */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Tags
        </label>
        <input
          type="text"
          name="tags"
          value={formData.tags}
          onChange={handleChange}
          placeholder="music, outdoor, family-friendly"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-500 mt-1">Comma-separated tags</p>
      </div>

      {/* Is Live */}
      <div className="flex items-center">
        <input
          type="checkbox"
          name="isLive"
          checked={formData.isLive}
          onChange={handleChange}
          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
        <label className="ml-2 text-sm text-gray-700">
          Publish (visible to users)
        </label>
      </div>

      {/* Buttons */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Saving..." : isEditMode ? "Update Event" : "Create Event"}
        </button>

        {isEditMode && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isSubmitting}
            className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
