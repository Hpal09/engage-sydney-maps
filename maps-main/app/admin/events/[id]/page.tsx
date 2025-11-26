import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import EventForm from "../EventForm";

export default async function EditEventPage({
  params,
}: {
  params: { id: string };
}) {
  const event = await prisma.event.findUnique({
    where: { id: params.id },
    include: {
      Place: {
        select: { name: true },
      },
    },
  });

  if (!event) {
    notFound();
  }

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

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Event</h1>

      <div className="bg-white rounded-lg shadow border border-gray-200 p-6 max-w-2xl">
        <EventForm event={event} places={places} />
      </div>
    </div>
  );
}
