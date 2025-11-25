import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/admin/buildings/[id] - Get single building
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const building = await prisma.building.findUnique({
      where: { id },
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
    });

    if (!building) {
      return NextResponse.json(
        { error: 'Building not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ building });
  } catch (error) {
    console.error('Error fetching building:', error);
    return NextResponse.json(
      { error: 'Failed to fetch building' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/buildings/[id] - Update building
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      );
    }

    const building = await prisma.building.update({
      where: { id },
      data: { name },
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
    });

    return NextResponse.json({ building });
  } catch (error) {
    console.error('Error updating building:', error);
    return NextResponse.json(
      { error: 'Failed to update building' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/buildings/[id] - Delete building
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    await prisma.building.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting building:', error);
    return NextResponse.json(
      { error: 'Failed to delete building' },
      { status: 500 }
    );
  }
}
