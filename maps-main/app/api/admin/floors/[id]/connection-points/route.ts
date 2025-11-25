import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/admin/floors/[id]/connection-points - Create connection point
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: floorId } = params;
    const body = await req.json();
    const { type, name, x, y, connectsToFloorId, isAccessible } = body;

    if (!type || !name || x === undefined || y === undefined) {
      return NextResponse.json(
        { error: 'type, name, x, and y are required' },
        { status: 400 }
      );
    }

    const connectionPoint = await prisma.connectionPoint.create({
      data: {
        floorId,
        type,
        name,
        x,
        y,
        connectsToFloorId: connectsToFloorId || null,
        isAccessible: isAccessible !== undefined ? isAccessible : true,
      },
    });

    return NextResponse.json({ connectionPoint }, { status: 201 });
  } catch (error) {
    console.error('Error creating connection point:', error);
    return NextResponse.json(
      { error: 'Failed to create connection point' },
      { status: 500 }
    );
  }
}
