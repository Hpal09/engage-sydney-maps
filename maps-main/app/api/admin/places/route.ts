import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const place = await prisma.place.create({
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
        tags: body.tags || [],
        isLive: body.isLive,
      },
    });

    return NextResponse.json(place);
  } catch (error) {
    console.error("Error creating place:", error);
    return NextResponse.json(
      { error: "Failed to create place" },
      { status: 500 }
    );
  }
}
