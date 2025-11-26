import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { placeId, indoorPoiId, rating, comment, category } = body;

    // Validate that at least one ID is provided
    if (!placeId && !indoorPoiId) {
      return NextResponse.json(
        { error: 'Either Place ID or Indoor POI ID is required' },
        { status: 400 }
      );
    }

    // Validate at least one feedback field is provided
    if (!rating && !comment) {
      return NextResponse.json(
        { error: 'Please provide either a rating or comment' },
        { status: 400 }
      );
    }

    // Validate rating if provided
    if (rating !== null && rating !== undefined) {
      const ratingNum = Number(rating);
      if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return NextResponse.json(
          { error: 'Rating must be between 1 and 5' },
          { status: 400 }
        );
      }
    }

    // Check if place or indoor POI exists
    if (placeId) {
      const placeExists = await prisma.place.findUnique({
        where: { id: placeId },
        select: { id: true },
      });

      if (!placeExists) {
        return NextResponse.json(
          { error: 'Place not found' },
          { status: 404 }
        );
      }
    }

    if (indoorPoiId) {
      const indoorPoiExists = await prisma.indoorPOI.findUnique({
        where: { id: indoorPoiId },
        select: { id: true },
      });

      if (!indoorPoiExists) {
        return NextResponse.json(
          { error: 'Indoor POI not found' },
          { status: 404 }
        );
      }
    }

    // Create feedback
    const feedback = await prisma.feedback.create({
      data: {
        placeId: placeId || null,
        indoorPoiId: indoorPoiId || null,
        rating: rating ? Number(rating) : null,
        comment: comment?.trim() || null,
        category: category || 'general',
      },
    });

    return NextResponse.json(
      {
        success: true,
        feedback: {
          id: feedback.id,
          createdAt: feedback.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating feedback:', error);
    return NextResponse.json(
      { error: 'Failed to submit feedback' },
      { status: 500 }
    );
  }
}

// Optional: GET endpoint to retrieve feedback for admin purposes
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const placeId = searchParams.get('placeId');

    const where = placeId ? { placeId } : {};

    const feedbacks = await prisma.feedback.findMany({
      where,
      include: {
        Place: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100, // Limit to last 100 feedbacks
    });

    return NextResponse.json({ feedbacks });
  } catch (error) {
    console.error('Error fetching feedback:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feedback' },
      { status: 500 }
    );
  }
}
