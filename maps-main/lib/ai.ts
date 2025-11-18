import type { Business } from '@/types';
import type { Deal, Event } from '@/lib/dataService';
import type {
  AIFilters,
  AIRecommendation,
  AIEntryContext,
  AIServerPayload,
  AIFollowUpChip,
} from '@/types/ai';
import { calculateDistance } from './coordinateMapper';

const API_KEY = process.env.MISTRAL_API_KEY ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-large-latest';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function extractJson<T>(text: string): T | null {
  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const raw = fenced ? fenced[1] : text;
    return JSON.parse(raw) as T;
  } catch (_) {
    try {
      const first = text.indexOf('{');
      const last = text.lastIndexOf('}');
      if (first >= 0 && last > first) {
        return JSON.parse(text.slice(first, last + 1)) as T;
      }
    } catch (_) {
      return null;
    }
    return null;
  }
}

function priceToBand(price?: Business['priceRange']): number | null {
  if (!price) return null;
  return { '$': 1, '$$': 2, '$$$': 3, '$$$$': 4 }[price] ?? null;
}

export function buildFollowUps(
  entryContext: AIEntryContext,
  opts?: { hasDeals?: boolean; hasFitness?: boolean; hasEvents?: boolean },
): AIFollowUpChip[] {
  switch (entryContext.type) {
    case 'fresh':
      return [
        { id: 'lunch-deals', label: 'Lunch Deals', payload: 'lunch deals nearby' },
        { id: 'coffee-nearby', label: 'Coffee Nearby', payload: 'coffee nearby' },
        ...(opts?.hasFitness ? [{ id: 'fitness', label: 'Fitness Studios', payload: 'fitness studios near me' }] : []),
        { id: 'tonight', label: "What's on Tonight", payload: "what's on tonight" },
      ];
    case 'query':
      return [
        { id: 'best', label: `Best ${entryContext.query}`, payload: `best ${entryContext.query}` },
        { id: 'nearby', label: `${entryContext.query} Nearby`, payload: `${entryContext.query} nearby` },
        ...(opts?.hasDeals ? [{ id: 'deals', label: `${entryContext.query} Deals`, payload: `${entryContext.query} deals` }] : []),
        { id: 'vibe', label: 'Quiet, Work friendly', payload: 'quiet work friendly' },
      ];
    case 'category':
      return [
        { id: 'brunch', label: 'Brunch & Cafes', payload: 'brunch and cafes' },
        { id: 'healthy', label: 'Healthy Eats', payload: 'healthy eats' },
        { id: 'quick', label: 'Quick & Casual', payload: 'quick casual' },
        ...(opts?.hasDeals ? [{ id: 'deals', label: 'After-Work Drink Deals', payload: 'after work drink deals' }] : []),
      ];
    case 'subcategory':
      return [
        { id: 'rooftop', label: 'Rooftop Drinks', payload: 'rooftop drinks' },
        { id: 'live-music', label: 'Live DJ + Cocktails', payload: 'live dj cocktails' },
        { id: 'date', label: 'Date-night Spots', payload: 'date night spots' },
        { id: 'trivia', label: 'Trivia Nights', payload: 'trivia nights nearby' },
      ];
    default:
      return [];
  }
}

function rankRecommendations(
  businesses: Business[],
  deals: Deal[],
  events: Event[],
  filters: AIFilters,
  userLocation?: { lat: number; lng: number } | null,
): AIRecommendation[] {
  const items: AIRecommendation[] = [];
  const { categories = [], keywords = [], priceRange, vibes = [] } = filters;
  const wantedCategories = categories.map((c) => c.toLowerCase());
  const wantedKeywords = keywords.map((k) => k.toLowerCase());
  const wantedVibes = vibes.map((v) => v.toLowerCase());
  const minPrice = priceRange?.min ?? null;
  const maxPrice = priceRange?.max ?? null;

  const scoreCommon = (
    title: string,
    category: string | undefined,
    itemPrice?: Business['priceRange'],
  ) => {
    let score = 0;
    if (category && wantedCategories.length && wantedCategories.includes(category.toLowerCase())) {
      score += 3;
    }
    if (wantedKeywords.length && wantedKeywords.some((k) => title.toLowerCase().includes(k))) {
      score += 2;
    }
    const band = priceToBand(itemPrice);
    if (band !== null) {
      if (minPrice !== null && band >= minPrice) score += 0.5;
      if (maxPrice !== null && band <= maxPrice) score += 0.5;
    }
    if (wantedVibes.length) {
      score += 0.5; // soft boost to allow vibe presence without structured data
    }
    return score;
  };

  businesses.forEach((b) => {
    const distanceMeters = userLocation ? calculateDistance(userLocation, { lat: b.lat, lng: b.lng }) : undefined;
    let score = scoreCommon(b.name, b.category, b.priceRange);
    if (distanceMeters !== undefined) {
      score += Math.max(0, 1.5 - distanceMeters / 1500);
    } else {
      score += 0.5;
    }
    if (b.rating) score += (b.rating / 5) * 0.5;
    items.push({
      type: 'place',
      id: b.id,
      title: b.name,
      subtitle: b.category,
      distanceMeters,
      rating: b.rating ?? null,
      ratingSource: b.rating ? 'internal' : null,
      priceRange: b.priceRange ?? null,
      extraBadges: [],
    });
    (items[items.length - 1] as any)._score = score;
  });

  deals.forEach((d) => {
    const distSource = businesses.find((b) => b.id === d.placeId);
    const distanceMeters = distSource && userLocation
      ? calculateDistance(userLocation, { lat: distSource.lat, lng: distSource.lng })
      : undefined;
    let score = scoreCommon(d.title, undefined);
    score += 1.5; // boost deals
    if (distanceMeters !== undefined) {
      score += Math.max(0, 1.2 - distanceMeters / 1800);
    }
    items.push({
      type: 'deal',
      id: d.id,
      title: d.title,
      subtitle: d.description ?? d.placeName ?? undefined,
      distanceMeters,
      rating: null,
      ratingSource: null,
      extraBadges: ['Deal'],
    } as AIRecommendation);
    (items[items.length - 1] as any)._score = score;
  });

  events.forEach((e) => {
    const distSource = e.placeId ? businesses.find((b) => b.id === e.placeId) : undefined;
    const distanceMeters = distSource && userLocation
      ? calculateDistance(userLocation, { lat: distSource.lat, lng: distSource.lng })
      : undefined;
    let score = scoreCommon(e.title, e.category);
    score += 1.0; // event boost
    if (distanceMeters !== undefined) {
      score += Math.max(0, 1.2 - distanceMeters / 2000);
    }
    items.push({
      type: 'event',
      id: e.id,
      title: e.title,
      subtitle: e.description ?? e.placeName ?? e.category,
      distanceMeters,
      rating: null,
      ratingSource: null,
      extraBadges: ['Tonight'],
    } as AIRecommendation);
    (items[items.length - 1] as any)._score = score;
  });

  return items
    .sort((a: any, b: any) => (b._score ?? 0) - (a._score ?? 0))
    .slice(0, 12)
    .map(({ _score, ...rest }: any) => rest);
}

export async function aiSearch(
  query: string,
  businesses: Business[],
  deals: Deal[],
  events: Event[],
  history: ChatMessage[] = [],
  entryContext: AIEntryContext,
  userLocation?: { lat: number; lng: number } | null,
  nearestLandmark?: string | null,
): Promise<AIServerPayload | null> {
  if (!API_KEY) return null;
  try {
    const categories = Array.from(new Set(businesses.map((b) => b.category))).join(', ');
    const convo = history
      .slice(-6)
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const locationContext = nearestLandmark
      ? `The user is currently near ${nearestLandmark} in Sydney CBD.`
      : userLocation
      ? `The user is in Sydney CBD.`
      : `The user is exploring Sydney CBD area.`;

    const prompt =
      `You are the Engage Sydney AI assistant helping users discover places, deals, and events.\n\n` +
      `${locationContext}\n` +
      `Entry mode: ${JSON.stringify(entryContext)}\n` +
      `User query: "${query || '(no query yet)'}"\n` +
      `Conversation history (last 6 turns):\n${convo || '(none)'}\n` +
      `Available categories: ${categories}\n\n` +
      `Your job:\n` +
      `1) Understand what the user wants (budget, vibe, time, location).\n` +
      `2) Decide intent: "browse", "ask_info", "navigate", or "unknown".\n` +
      `3) Set filters: categories, keywords, priceRange {min,max}, timeOfDay, vibes.\n\n` +
      `Return ONLY JSON (no markdown) with this shape:\n` +
      `{\n` +
      `  "response": "short chat message to show to user (friendly, concise)",\n` +
      `  "intent": "browse",\n` +
      `  "categories": ["coffee", "cafes"],\n` +
      `  "keywords": ["coffee", "bakes"],\n` +
      `  "priceRange": { "min": 1, "max": 2 },\n` +
      `  "timeOfDay": "lunch",\n` +
      `  "vibes": ["quiet", "work-friendly"]\n` +
      `}\n` +
      `Rules: Always return valid JSON. Do not invent places or addresses.`;

    const mistralRes = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      }),
    });
    if (!mistralRes.ok) {
      const errText = await mistralRes.text().catch(() => '');
      console.error('Mistral request failed', {
        status: mistralRes.status,
        statusText: mistralRes.statusText,
        body: errText?.slice(0, 500),
      });
      return null;
    }
    const mistralData: any = await mistralRes.json();
    const text: string | undefined = mistralData?.choices?.[0]?.message?.content;
    if (!text) return null;
    const parsed = extractJson<AIFilters>(text);
    if (!parsed) return null;

    const recommendations = rankRecommendations(businesses, deals, events, parsed, userLocation);
    if (!recommendations.length) return null;

    const followUps = buildFollowUps(entryContext);
    const payload: AIServerPayload = {
      source: 'ai',
      message: parsed.response ?? 'Here are some options nearby.',
      recommendations,
      followUps,
    };
    return payload;
  } catch (_) {
    return null;
  }
}
