"use client";

import { useState } from "react";
import Link from "next/link";
import { Edit, Search } from "lucide-react";
import { Event, Place } from "@prisma/client";

type EventWithPlace = Event & {
  place: Pick<Place, "name"> | null;
};

export default function EventsTable({ events }: { events: EventWithPlace[] }) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredEvents = events.filter((event) => {
    const titleMatch = event.title
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const placeMatch = event.place?.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const categoryMatch = event.category
      .toLowerCase()
      .includes(searchQuery.toLowerCase());

    return titleMatch || placeMatch || categoryMatch;
  });

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatCategory = (category: string) => {
    const labels: Record<string, string> = {
      "live-music": "Live Music",
      food: "Food",
      market: "Market",
      experience: "Experience",
      other: "Other",
    };
    return labels[category] || category;
  };

  return (
    <div>
      {/* Search Box */}
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search events by title, place, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Location
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Starts At
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ends At
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredEvents.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  {searchQuery
                    ? "No events found matching your search."
                    : "No events yet. Add your first event!"}
                </td>
              </tr>
            ) : (
              filteredEvents.map((event) => (
                <tr key={event.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {event.place?.name || (
                        <span className="text-gray-500 italic">Area-wide</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{event.title}</div>
                    {event.description && (
                      <div className="text-xs text-gray-500 mt-1 line-clamp-1">
                        {event.description}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      {formatCategory(event.category)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(event.startsAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(event.endsAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {event.isLive ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        Live
                      </span>
                    ) : (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                        Hidden
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link
                      href={`/admin/events/${event.id}`}
                      className="text-blue-600 hover:text-blue-900 inline-flex items-center gap-1"
                    >
                      <Edit className="h-4 w-4" />
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t bg-gray-50 text-sm text-gray-500">
        Showing {filteredEvents.length} of {events.length} events
      </div>
    </div>
  );
}
