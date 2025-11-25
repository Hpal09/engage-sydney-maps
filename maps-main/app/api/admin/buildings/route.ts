import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/admin/buildings - List all buildings
export async function GET() {
  try {
    const buildings = await prisma.building.findMany({
      include: {
        Place: {
          select: {
            id: true,
            name: true,
          },
        },
        floors: {
          include: {
            connectionPoints: true,
          },
          orderBy: {
            floorNumber: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ buildings });
  } catch (error) {
    console.error('Error fetching buildings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch buildings' },
      { status: 500 }
    );
  }
}

// POST /api/admin/buildings - Create new building
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { placeId, name } = body;

    if (!placeId || !name) {
      return NextResponse.json(
        { error: 'placeId and name are required' },
        { status: 400 }
      );
    }

    // Check if building already exists for this place
    const existingBuilding = await prisma.building.findUnique({
      where: { placeId },
    });

    if (existingBuilding) {
      return NextResponse.json(
        { error: 'Building already exists for this place' },
        { status: 400 }
      );
    }

    const building = await prisma.building.create({
      data: {
        placeId,
        name,
      },
      include: {
        Place: {
          select: {
            id: true,
            name: true,
          },
        },
        floors: true,
      },
    });

    return NextResponse.json({ building }, { status: 201 });
  } catch (error) {
    console.error('Error creating building:', error);
    return NextResponse.json(
      { error: 'Failed to create building' },
      { status: 500 }
    );
  }
}
