import { prisma } from "@/lib/prisma";
import Link from "next/link";
import EventForm from "../EventForm";

export default async function NewEventPage() {
  const places = await prisma.place.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/events"
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          &larr; Back to Events
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Add New Event</h1>

      <div className="bg-white rounded-lg shadow border border-gray-200 p-6 max-w-2xl">
        <EventForm places={places} />
      </div>
    </div>
  );
}
