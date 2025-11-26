import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/admin/floors/[id]/indoor-pois - Create indoor POI
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: floorId } = params;
    const body = await req.json();
    const {
      name,
      category,
      description,
      x,
      y,
      svgElementId,
      hours,
      priceRange,
      imageUrl,
      website,
      phone,
      tags,
      isLive,
    } = body;

    if (!name || x === undefined || y === undefined) {
      return NextResponse.json(
        { error: 'name, x, and y are required' },
        { status: 400 }
      );
    }

    const indoorPOI = await prisma.indoorPOI.create({
      data: {
        floorId,
        name,
        category: category || null,
        description: description || null,
        x,
        y,
        svgElementId: svgElementId || null,
        hours: hours || null,
        priceRange: priceRange || null,
        imageUrl: imageUrl || null,
        website: website || null,
        phone: phone || null,
        tags: tags || [],
        isLive: isLive !== undefined ? isLive : true,
      },
    });

    return NextResponse.json({ indoorPOI }, { status: 201 });
  } catch (error) {
    console.error('Error creating indoor POI:', error);
    return NextResponse.json(
      { error: 'Failed to create indoor POI' },
      { status: 500 }
    );
  }
}
