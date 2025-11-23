import { prisma } from "@/lib/prisma";
import Link from "next/link";
import EventsTable from "./EventsTable";

export default async function EventsPage() {
  const events = await prisma.event.findMany({
    include: {
      Place: {
        select: {
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Events</h1>
        <Link
          href="/admin/events/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          Add Event
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-200">
        <EventsTable events={events} />
      </div>
    </div>
  );
}
