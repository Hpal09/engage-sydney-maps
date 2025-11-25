import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/admin/floors/[id] - Get single floor
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const floor = await prisma.floor.findUnique({
      where: { id },
      include: {
        connectionPoints: true,
        Building: {
          include: {
            Place: {
              select: {
                id: true,
                name: true,
              },
            },
            floors: {
              select: {
                id: true,
                name: true,
              },
              orderBy: {
                floorNumber: 'asc',
              },
            },
          },
        },
      },
    });

    if (!floor) {
      return NextResponse.json(
        { error: 'Floor not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ floor });
  } catch (error) {
    console.error('Error fetching floor:', error);
    return NextResponse.json(
      { error: 'Failed to fetch floor' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/floors/[id] - Update floor
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();
    const { name, floorNumber, svgPath } = body;

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (floorNumber !== undefined) data.floorNumber = floorNumber;
    if (svgPath !== undefined) data.svgPath = svgPath;

    const floor = await prisma.floor.update({
      where: { id },
      data,
      include: {
        connectionPoints: true,
      },
    });

    return NextResponse.json({ floor });
  } catch (error) {
    console.error('Error updating floor:', error);
    return NextResponse.json(
      { error: 'Failed to update floor' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/floors/[id] - Delete floor
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    await prisma.floor.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting floor:', error);
    return NextResponse.json(
      { error: 'Failed to delete floor' },
      { status: 500 }
    );
  }
}
