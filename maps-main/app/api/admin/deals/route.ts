import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const deal = await prisma.deal.create({
      data: {
        placeId: body.placeId,
        title: body.title,
        description: body.description,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        tags: body.tags || [],
        isLive: body.isLive,
      },
    });

    return NextResponse.json(deal);
  } catch (error) {
    console.error("Error creating deal:", error);
    return NextResponse.json(
      { error: "Failed to create deal" },
      { status: 500 }
    );
  }
}
