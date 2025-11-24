import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();

    const place = await prisma.place.update({
      where: { id: params.id },
      data: {
        name: body.name,
        category: body.category,
        shortDescription: body.shortDescription,
        fullDescription: body.fullDescription,
        address: body.address,
        lat: body.lat,
        lng: body.lng,
        phone: body.phone,
        websiteUrl: body.websiteUrl,
        openingHours: body.openingHours,
        priceRange: body.priceRange,
        imageUrl: body.imageUrl,
        tags: body.tags || [],
        isLive: body.isLive,
      },
    });

    return NextResponse.json(place);
  } catch (error) {
    console.error("Error updating place:", error);
    return NextResponse.json(
      { error: "Failed to update place" },
      { status: 500 }
    );
  }
}
