import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();

    const deal = await prisma.deal.update({
      where: { id: params.id },
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
    console.error("Error updating deal:", error);
    return NextResponse.json(
      { error: "Failed to update deal" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.deal.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting deal:", error);
    return NextResponse.json(
      { error: "Failed to delete deal" },
      { status: 500 }
    );
  }
}
