import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// PUT /api/admin/buildings/[id]/entrances/[entranceId]
export async function PUT(
  request: Request,
  { params }: { params: { id: string; entranceId: string } }
) {
  try {
    const { entranceId } = params;
    const data = await request.json();

    const entrance = await prisma.buildingEntrance.update({
      where: { id: entranceId },
      data: {
        name: data.name,
        type: data.type,
        lat: parseFloat(data.lat),
        lng: parseFloat(data.lng),
        indoorX: parseFloat(data.indoorX),
        indoorY: parseFloat(data.indoorY),
        isAccessible: data.isAccessible,
        isOpen: data.isOpen,
      },
    });

    return NextResponse.json({ entrance });
  } catch (error) {
    console.error('Error updating entrance:', error);
    return NextResponse.json(
      { error: 'Failed to update entrance' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/buildings/[id]/entrances/[entranceId]
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; entranceId: string } }
) {
  try {
    const { entranceId } = params;

    await prisma.buildingEntrance.delete({
      where: { id: entranceId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting entrance:', error);
    return NextResponse.json(
      { error: 'Failed to delete entrance' },
      { status: 500 }
    );
  }
}
