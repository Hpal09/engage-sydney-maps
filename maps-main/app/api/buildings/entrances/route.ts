import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Get all building entrances (for hybrid pathfinding graph building)
export async function GET() {
  try {
    const entrances = await prisma.buildingEntrance.findMany({
      where: {
        isOpen: true,
      },
      select: {
        id: true,
        buildingId: true,
        floorId: true,
        name: true,
        type: true,
        lat: true,
        lng: true,
        indoorX: true,
        indoorY: true,
        isAccessible: true,
      },
      orderBy: [
        { buildingId: 'asc' },
        { type: 'asc' },
      ],
    });

    // Group by building for easier access
    const byBuilding = entrances.reduce((acc, entrance) => {
      if (!acc[entrance.buildingId]) {
        acc[entrance.buildingId] = [];
      }
      acc[entrance.buildingId].push(entrance);
      return acc;
    }, {} as Record<string, typeof entrances>);

    return NextResponse.json({
      entrances,
      byBuilding,
      count: entrances.length,
    });
  } catch (error) {
    console.error('Error fetching all building entrances:', error);
    return NextResponse.json(
      { error: 'Failed to fetch building entrances' },
      { status: 500 }
    );
  }
}
