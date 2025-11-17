import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Plus } from "lucide-react";
import PlacesTable from "./PlacesTable";

export default async function PlacesPage() {
  const places = await prisma.place.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Places</h1>
        <Link
          href="/admin/places/new"
          className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
        >
          <Plus className="h-5 w-5" />
          Add Place
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-200">
        <PlacesTable places={places} />
      </div>
    </div>
  );
}
