import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();
    const { action, value } = body;

    // Validate feedback exists
    const feedback = await prisma.feedback.findUnique({
      where: { id },
    });

    if (!feedback) {
      return NextResponse.json(
        { error: 'Feedback not found' },
        { status: 404 }
      );
    }

    let updateData: any = {};

    switch (action) {
      case 'updateStatus':
        if (!['pending', 'reviewed', 'resolved', 'dismissed'].includes(value)) {
          return NextResponse.json(
            { error: 'Invalid status value' },
            { status: 400 }
          );
        }
        updateData.status = value;
        break;

      case 'toggleFlag':
        updateData.isFlagged = value === true;
        break;

      case 'toggleEscalate':
        updateData.isEscalated = value === true;
        break;

      case 'updateNotes':
        updateData.adminNotes = value || null;
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

    // Update feedback
    const updatedFeedback = await prisma.feedback.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      feedback: updatedFeedback,
    });
  } catch (error) {
    console.error('Error updating feedback:', error);
    return NextResponse.json(
      { error: 'Failed to update feedback' },
      { status: 500 }
    );
  }
}

// Delete feedback
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    await prisma.feedback.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Feedback deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting feedback:', error);
    return NextResponse.json(
      { error: 'Failed to delete feedback' },
      { status: 500 }
    );
  }
}
