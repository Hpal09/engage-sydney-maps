import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { ZoomConfig } from '@/types';

/**
 * GET /api/map-settings
 * Returns zoom configuration for different map states
 */
export async function GET() {
  try {
    const settings = await prisma.mapSettings.findFirst({
      where: { id: 1 },
    });

    const config: ZoomConfig = {
      initial: settings?.initialZoom ?? 2.5,
      placeStart: settings?.placeZoom ?? 2.8,
      destination: settings?.destZoom ?? 2.8,
      navigation: settings?.navZoom ?? 3.0,
    };

    return NextResponse.json(config);
  } catch (error) {
    console.error('[API] Failed to fetch map settings:', error);

    // Return defaults on error
    return NextResponse.json({
      initial: 2.5,
      placeStart: 2.8,
      destination: 2.8,
      navigation: 3.0,
    });
  }
}

/**
 * PUT /api/map-settings
 * Updates zoom configuration (admin only)
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json() as Partial<ZoomConfig>;

    const settings = await prisma.mapSettings.upsert({
      where: { id: 1 },
      update: {
        initialZoom: body.initial,
        placeZoom: body.placeStart,
        destZoom: body.destination,
        navZoom: body.navigation,
      },
      create: {
        id: 1,
        initialZoom: body.initial ?? 2.5,
        placeZoom: body.placeStart ?? 2.8,
        destZoom: body.destination ?? 2.8,
        navZoom: body.navigation ?? 3.0,
      },
    });

    return NextResponse.json({
      initial: settings.initialZoom,
      placeStart: settings.placeZoom,
      destination: settings.destZoom,
      navigation: settings.navZoom,
    });
  } catch (error) {
    console.error('[API] Failed to update map settings:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
