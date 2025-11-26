import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: { placeId: string } }
) {
  try {
    const { placeId } = params;

    // Fetch building with floors, connection points, and indoor POIs
    const building = await prisma.building.findUnique({
      where: { placeId },
      include: {
        floors: {
          include: {
            connectionPoints: true,
            indoorPOIs: {
              where: {
                isLive: true,
              },
              orderBy: {
                name: 'asc',
              },
            },
          },
          orderBy: {
            floorNumber: 'asc',
          },
        },
      },
    });

    if (!building) {
      return NextResponse.json(
        { error: 'Building not found for this place' },
        { status: 404 }
      );
    }

    return NextResponse.json({ building });
  } catch (error) {
    console.error('Error fetching building data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch building data' },
      { status: 500 }
    );
  }
}
