import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const event = await prisma.event.create({
      data: {
        placeId: body.placeId || null,
        title: body.title,
        description: body.description,
        category: body.category,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        tags: body.tags || [],
        isLive: body.isLive,
      },
    });

    return NextResponse.json(event);
  } catch (error) {
    console.error("Error creating event:", error);
    return NextResponse.json(
      { error: "Failed to create event" },
      { status: 500 }
    );
  }
}
