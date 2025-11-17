import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import DealForm from "../DealForm";
import { notFound } from "next/navigation";

export default async function EditDealPage({
  params,
}: {
  params: { id: string };
}) {
  const [deal, places] = await Promise.all([
    prisma.deal.findUnique({
      where: { id: params.id },
    }),
    prisma.place.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    }),
  ]);

  if (!deal) {
    notFound();
  }

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
        <h1 className="text-2xl font-bold text-gray-900">Edit Deal</h1>
        <p className="text-gray-600 mt-1">{deal.title}</p>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <DealForm deal={deal} places={places} mode="edit" />
      </div>
    </div>
  );
}
