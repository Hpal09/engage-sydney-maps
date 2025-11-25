import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// DELETE /api/admin/connection-points/[id] - Delete connection point
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    await prisma.connectionPoint.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting connection point:', error);
    return NextResponse.json(
      { error: 'Failed to delete connection point' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/connection-points/[id] - Update connection point
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();
    const { type, name, x, y, connectsToFloorId, isAccessible } = body;

    const data: any = {};
    if (type !== undefined) data.type = type;
    if (name !== undefined) data.name = name;
    if (x !== undefined) data.x = x;
    if (y !== undefined) data.y = y;
    if (connectsToFloorId !== undefined) data.connectsToFloorId = connectsToFloorId;
    if (isAccessible !== undefined) data.isAccessible = isAccessible;

    const connectionPoint = await prisma.connectionPoint.update({
      where: { id },
      data,
    });

    return NextResponse.json({ connectionPoint });
  } catch (error) {
    console.error('Error updating connection point:', error);
    return NextResponse.json(
      { error: 'Failed to update connection point' },
      { status: 500 }
    );
  }
}
