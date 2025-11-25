import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/admin/buildings/[id]/floors - Create new floor
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: buildingId } = params;
    const body = await req.json();
    const { name, floorNumber, svgPath } = body;

    if (!name || floorNumber === undefined || !svgPath) {
      return NextResponse.json(
        { error: 'name, floorNumber, and svgPath are required' },
        { status: 400 }
      );
    }

    const floor = await prisma.floor.create({
      data: {
        buildingId,
        name,
        floorNumber,
        svgPath,
      },
      include: {
        connectionPoints: true,
      },
    });

    return NextResponse.json({ floor }, { status: 201 });
  } catch (error) {
    console.error('Error creating floor:', error);
    return NextResponse.json(
      { error: 'Failed to create floor' },
      { status: 500 }
    );
  }
}
