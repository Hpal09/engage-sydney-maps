import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PlaceForm from "../PlaceForm";

export default function NewPlacePage() {
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
        <h1 className="text-2xl font-bold text-gray-900">Add New Place</h1>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <PlaceForm mode="create" />
      </div>
    </div>
  );
}
