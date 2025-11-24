import { prisma } from "@/lib/prisma";
import type { Business } from "@/types";

/**
 * Data Service Layer
 *
 * This layer abstracts data access from the database.
 * All data is fetched from the PostgreSQL database via Prisma.
 */

export async function getPlaces(): Promise<Business[]> {
  const places = await prisma.place.findMany({
    where: {
      isLive: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  // Map Place model to Business type
  const mapped: Business[] = places.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    lat: p.lat,
    lng: p.lng,
    address: p.address ?? undefined,
    priceRange: p.priceRange as Business["priceRange"],
    description: p.shortDescription ?? p.fullDescription ?? undefined,
    hours: p.openingHours ?? undefined,
    phone: p.phone ?? undefined,
    website: (p as any).website ?? undefined,
    rating: p.rating ?? undefined,
    imageUrl: p.imageUrl ?? undefined,
    tags: p.tags ?? [],
  }));

  return mapped;
}

export interface Deal {
  id: string;
  placeId: string;
  placeName: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  tags: string[];
  isLive: boolean;
}

export interface Event {
  id: string;
  placeId: string | null;
  placeName: string | null;
  title: string;
  description: string | null;
  category: string;
  startsAt: Date;
  endsAt: Date;
  tags: string[];
  isLive: boolean;
}

export async function getDeals(): Promise<Deal[]> {
  const now = new Date();

  const deals = await prisma.deal.findMany({
    where: {
      isLive: true,
      endsAt: {
        gte: now,
      },
    },
    include: {
      Place: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      startsAt: "asc",
    },
  });

  return deals.map((d) => ({
    id: d.id,
    placeId: d.placeId,
    placeName: d.Place.name,
    title: d.title,
    description: d.description,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    tags: d.tags,
    isLive: d.isLive,
  }));
}

export async function getEvents(): Promise<Event[]> {
  const now = new Date();

  const events = await prisma.event.findMany({
    where: {
      isLive: true,
      endsAt: {
        gte: now,
      },
    },
    include: {
      Place: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      startsAt: "asc",
    },
  });

  return events.map((e) => ({
    id: e.id,
    placeId: e.placeId,
    placeName: e.Place?.name ?? null,
    title: e.title,
    description: e.description,
    category: e.category,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    tags: e.tags,
    isLive: e.isLive,
  }));
}
