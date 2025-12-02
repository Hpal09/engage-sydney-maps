import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/admin/buildings/[id]/entrances
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const entrances = await prisma.buildingEntrance.findMany({
      where: { buildingId: id },
      orderBy: [
        { type: 'asc' },
        { name: 'asc' },
      ],
    });

    return NextResponse.json({ entrances });
  } catch (error) {
    console.error('Error fetching entrances:', error);
    return NextResponse.json(
      { error: 'Failed to fetch entrances' },
      { status: 500 }
    );
  }
}

// POST /api/admin/buildings/[id]/entrances
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const data = await request.json();

    const entrance = await prisma.buildingEntrance.create({
      data: {
        buildingId: id,
        floorId: data.floorId,
        name: data.name,
        type: data.type || 'main',
        lat: parseFloat(data.lat),
        lng: parseFloat(data.lng),
        indoorX: parseFloat(data.indoorX),
        indoorY: parseFloat(data.indoorY),
        isAccessible: data.isAccessible ?? true,
        isOpen: data.isOpen ?? true,
      },
    });

    return NextResponse.json({ entrance }, { status: 201 });
  } catch (error) {
    console.error('Error creating entrance:', error);
    return NextResponse.json(
      { error: 'Failed to create entrance' },
      { status: 500 }
    );
  }
}
