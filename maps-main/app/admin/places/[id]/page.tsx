import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PlaceForm from "../PlaceForm";
import { notFound } from "next/navigation";

export default async function EditPlacePage({
  params,
}: {
  params: { id: string };
}) {
  const place = await prisma.place.findUnique({
    where: { id: params.id },
  });

  if (!place) {
    notFound();
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/places"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Places
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Place</h1>
        <p className="text-gray-600 mt-1">{place.name}</p>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <PlaceForm place={place} mode="edit" />
      </div>
    </div>
  );
}
