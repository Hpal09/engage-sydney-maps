import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/admin/indoor-pois/[id] - Get single indoor POI
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const indoorPOI = await prisma.indoorPOI.findUnique({
      where: { id },
      include: {
        Floor: {
          include: {
            Building: {
              include: {
                Place: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!indoorPOI) {
      return NextResponse.json(
        { error: 'Indoor POI not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ indoorPOI });
  } catch (error) {
    console.error('Error fetching indoor POI:', error);
    return NextResponse.json(
      { error: 'Failed to fetch indoor POI' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/indoor-pois/[id] - Update indoor POI
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();

    const data: any = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.category !== undefined) data.category = body.category;
    if (body.description !== undefined) data.description = body.description;
    if (body.x !== undefined) data.x = body.x;
    if (body.y !== undefined) data.y = body.y;
    if (body.svgElementId !== undefined) data.svgElementId = body.svgElementId;
    if (body.hours !== undefined) data.hours = body.hours;
    if (body.priceRange !== undefined) data.priceRange = body.priceRange;
    if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl;
    if (body.website !== undefined) data.website = body.website;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.tags !== undefined) data.tags = body.tags;
    if (body.isLive !== undefined) data.isLive = body.isLive;

    const indoorPOI = await prisma.indoorPOI.update({
      where: { id },
      data,
    });

    return NextResponse.json({ indoorPOI });
  } catch (error) {
    console.error('Error updating indoor POI:', error);
    return NextResponse.json(
      { error: 'Failed to update indoor POI' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/indoor-pois/[id] - Delete indoor POI
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    await prisma.indoorPOI.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting indoor POI:', error);
    return NextResponse.json(
      { error: 'Failed to delete indoor POI' },
      { status: 500 }
    );
  }
}
