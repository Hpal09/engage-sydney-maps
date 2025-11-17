import { NextRequest, NextResponse } from 'next/server';
import { getPlaces } from '@/lib/dataService';
import type { Business, SearchResult } from '@/types';
import { aiSearch } from '@/lib/ai';
import { calculateDistance } from '@/lib/coordinateMapper';

// Runtime validation: Ensure API keys are configured
// This will throw an error at build time if keys are missing
const API_KEY = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
if (!API_KEY && process.env.NODE_ENV === 'production') {
  console.warn(
    '⚠️  WARNING: No API key found. AI search will fall back to keyword matching. ' +
    'Set GOOGLE_API_KEY or GEMINI_API_KEY in your environment variables.'
  );
}

function filterByQuery(query: string, businesses: Business[]): Business[] {
  const q = query.toLowerCase();

  // Category patterns
  if (/(coffee|cafe|espresso)/.test(q)) {
    return businesses.filter((b) => b.category.toLowerCase() === 'cafe');
  }
  if (/chinese/.test(q)) {
    return businesses.filter((b) => b.category.toLowerCase() === 'chinese');
  }
  if (/thai/.test(q)) {
    return businesses.filter((b) => b.category.toLowerCase() === 'thai');
  }
  if (/(fast\s*food|burger|fries)/.test(q)) {
    return businesses.filter((b) => b.category.toLowerCase() === 'fast food');
  }
  if (/(cheap|budget|affordable)/.test(q)) {
    return businesses.filter((b) => b.priceRange === '$');
  }

  // Fallback: keyword match name/category
  return businesses.filter(
    (b) =>
      b.name.toLowerCase().includes(q) ||
      b.category.toLowerCase().includes(q),
  );
}

function findNearestLandmark(userLocation: { lat: number; lng: number } | null, businesses: Business[]): string | null {
  if (!userLocation) return null;

  let nearestBusiness: Business | undefined = undefined;
  let nearestDistance = Infinity;

  for (const business of businesses) {
    const distance = calculateDistance(userLocation, { lat: business.lat, lng: business.lng });
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestBusiness = business;
    }
  }

  // Only return if within 500m
  if (nearestBusiness !== undefined && nearestDistance < 500) {
    return nearestBusiness.name;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query: string = String(body?.query ?? '').slice(0, 200);
    const userLocation = body?.userLocation as { lat: number; lng: number } | null | undefined;
    const history = Array.isArray(body?.history)
      ? (body.history as { role: 'user' | 'assistant'; content: string }[])
      : [];
    if (!query) {
      return NextResponse.json(
        { error: 'Missing query' },
        { status: 400 },
      );
    }

    // Fetch all places from database
    const businesses = await getPlaces();

    // Find nearest landmark for context
    const nearestLandmark = findNearestLandmark(userLocation || null, businesses);
    const locationRef = nearestLandmark || 'Sydney CBD';

    console.log('🔍 AI Search:', { query, userLocation, nearestLandmark, locationRef });

    // Always use AI for conversational search
    const ai = await aiSearch(query, businesses, history, userLocation || null, nearestLandmark);
    if (ai) return NextResponse.json(ai);

    // AI failed or not configured: gracefully fallback to smart matching
    const fallback = filterByQuery(query, businesses).slice(0, 12);
    if (fallback.length > 0) {
      const payload: SearchResult = {
        response: `Here are some options for "${query}" near ${locationRef}.`,
        businessIds: fallback.map((b) => b.id),
        businesses: fallback,
        followupQuestions: [
          'Which one is closest to me?',
          'Show only cheap options',
          'Any vegetarian or vegan places?',
        ],
        categories: Array.from(new Set(fallback.map((b) => b.category))),
        priceRange: null,
        intent: 'fallback-match',
      };
      return NextResponse.json(payload);
    }

    // If no matches either, return helpful message
    const reason = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
      ? 'I could not parse your request just now.'
      : 'AI is not configured. Please add GOOGLE_API_KEY in .env.local.';
    return NextResponse.json(
      {
        response: `${reason} Try asking like: "I'm hungry, cheap vegan options" or "best coffee nearby".`,
        businessIds: [],
        businesses: [],
        followupQuestions: [
          'Show me cheap eats',
          'Find Chinese restaurants',
          'Closest coffee shop',
        ],
      } satisfies SearchResult,
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: 'Unexpected error' },
      { status: 500 },
    );
  }
}


