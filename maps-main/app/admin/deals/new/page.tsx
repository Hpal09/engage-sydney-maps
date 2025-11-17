import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import DealForm from "../DealForm";

export default async function NewDealPage() {
  const places = await prisma.place.findMany({
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/deals"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Deals
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Add New Deal</h1>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <DealForm mode="create" places={places} />
      </div>
    </div>
  );
}
