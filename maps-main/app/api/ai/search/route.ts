import { NextRequest, NextResponse } from 'next/server';
import { getPlaces, getDeals, getEvents } from '@/lib/dataService';
import type { Business } from '@/types';
import type { AIServerPayload, AIEntryContext } from '@/types/ai';
import { aiSearch, buildFollowUps } from '@/lib/ai';
import { calculateDistance } from '@/lib/coordinateMapper';

// Runtime validation: Ensure API keys are configured
// This will throw an error at build time if keys are missing
const API_KEY = process.env.MISTRAL_API_KEY ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
if (!API_KEY && process.env.NODE_ENV === 'production') {
  console.warn(
    '⚠️  WARNING: No API key found. AI search will fall back to keyword matching. ' +
    'Set MISTRAL_API_KEY (preferred) or GEMINI_API_KEY / GOOGLE_API_KEY in your environment variables.'
  );
}

// Basic spell correction and fuzzy matching for common typos / aliases
const COMMON_TYPO_MAP: Record<string, string> = {
  cofee: 'coffee',
  coffe: 'coffee',
  coff: 'coffee',
  resturant: 'restaurant',
  resturantss: 'restaurants',
  restuarant: 'restaurant',
  brekky: 'breakfast',
  bfast: 'breakfast',
  vegn: 'vegan',
  vegitarian: 'vegetarian',
  veggie: 'vegetarian',
  gymn: 'gym',
  gyym: 'gym',
  pilate: 'pilates',
  pilats: 'pilates',
  mex: 'mexican',
  jap: 'japanese',
  indi: 'indian',
};

function expandSynonyms(raw: string): string {
  const lower = (COMMON_TYPO_MAP[raw.toLowerCase().trim()] || raw.toLowerCase().trim());
  const synonyms: Record<string, string> = {
    brekky: 'breakfast',
    breakfast: 'breakfast',
    brunch: 'brunch',
    cheap: 'cheap affordable budget',
  };
  return synonyms[lower] || lower;
}

// Scoring weights (tweak after dogfooding)
const SCORING_WEIGHTS = {
  distance: 1.6,
  rating: 1.0,
  intentMatch: 1.2,
  openNow: 0.6,
  typeBoost: 0.8,
};

// Simple in-memory cache to reduce repeated calls
const CACHE_TTL_MS = 45_000;
const aiCache = new Map<string, { ts: number; data: AIServerPayload }>();

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[a.length][b.length];
}

function fuzzyIncludes(haystack: string, needle: string, threshold = 2): boolean {
  const words = haystack.split(/\s+/);
  return words.some((w) => {
    if (w.includes(needle)) return true;
    return levenshtein(w, needle) <= threshold;
  });
}

function isOpenNow(hours?: string | null): boolean | null {
  if (!hours) return null;
  const match = hours.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?\s*[-–]\s*(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
  if (!match) return null;
  const [ , h1, m1 = '0', ap1, h2, m2 = '0', ap2 ] = match;
  const toMinutes = (h: string, m: string, ap?: string | null) => {
    let hour = parseInt(h, 10);
    const mins = parseInt(m, 10);
    const apLower = ap ? ap.toLowerCase() : null;
    if (apLower === 'pm' && hour < 12) hour += 12;
    if (apLower === 'am' && hour === 12) hour = 0;
    return hour * 60 + mins;
  };
  const openMin = toMinutes(h1, m1, ap1);
  const closeMin = toMinutes(h2, m2, ap2);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (closeMin < openMin) {
    // crosses midnight
    return nowMin >= openMin || nowMin <= closeMin;
  }
  return nowMin >= openMin && nowMin <= closeMin;
}

function filterByQuery(query: string, businesses: Business[]): Business[] {
  const qRaw = expandSynonyms(query);
  const q = qRaw.toLowerCase();

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
  if (/(fitness|gym|workout|studio|pilates|yoga)/.test(q)) {
    return businesses.filter((b) =>
      b.category.toLowerCase().includes('fitness') ||
      b.category.toLowerCase().includes('gym') ||
      b.name.toLowerCase().includes('fitness') ||
      b.name.toLowerCase().includes('gym') ||
      b.name.toLowerCase().includes('studio') ||
      b.name.toLowerCase().includes('yoga') ||
      b.name.toLowerCase().includes('pilates')
    );
  }
  if (/(cheap|budget|affordable)/.test(q)) {
    return businesses.filter((b) => b.priceRange === '$');
  }

  // Fallback: keyword match name/category
  return businesses.filter((b) => {
    const name = b.name.toLowerCase();
    const cat = b.category.toLowerCase();
    return name.includes(q) || cat.includes(q) || fuzzyIncludes(name, q) || fuzzyIncludes(cat, q);
  });
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

function findPlaceByName(query: string, businesses: Business[]): Business | null {
  const qRaw = expandSynonyms(query).toLowerCase();
  const aliasKeywords = ['qvb', 'queen victoria building', 'queen victoria'];
  const hasQvbAlias = aliasKeywords.some((kw) => qRaw.includes(kw));
  const normalizedQuery = (hasQvbAlias ? 'queen victoria building qvb ' + qRaw : qRaw)
    .replace(/[()]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let best: Business | null = null;
  let bestLen = 0;
  businesses.forEach((b) => {
    const name = b.name.toLowerCase();
    const normalizedName = name.replace(/[()]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (
      normalizedQuery.includes(normalizedName) ||
      normalizedName.includes(normalizedQuery) ||
      normalizedName.startsWith(normalizedQuery) ||
      normalizedQuery.startsWith(normalizedName) ||
      fuzzyIncludes(normalizedQuery, normalizedName, 3) ||
      fuzzyIncludes(normalizedName, normalizedQuery, 3)
    ) {
      best = b;
      bestLen = name.length;
    }
  });
  return best;
}

function cheekyMessage(
  query: string,
  locationRef: string,
  topRecommendation?: { title?: string; subtitle?: string; distanceMeters?: number; priceRange?: string | null; rating?: number | null },
  nearestLandmark?: string | null
): string {
  const q = query.toLowerCase().trim();
  const distText = topRecommendation?.distanceMeters !== undefined ? `${Math.round(topRecommendation.distanceMeters)}m away` : 'nearby';
  const priceText = topRecommendation?.priceRange ? `${topRecommendation.priceRange}` : '';
  const landmarkText = nearestLandmark || locationRef;

  // Put weather/off-topic first to avoid matching food intents
  if (/weather|rain|sun|hot|cold|temperature/i.test(q)) {
    return `I can’t check the sky without a weather feed—yet. Want food/drink suggestions nearby while you peek outside?`;
  }
  if (/joke|sing|song|funny/i.test(q)) {
    return `I’m better at food than falsetto, but here’s a quick pick near ${landmarkText}. Want me to plan a snack instead?`;
  }

  if (!q || /^(hi|hey|hello|yo|hiya|sup|what's up|gday|g’d?ay)/i.test(q)) {
    return `Hey! I’m your Sydney sidekick near ${landmarkText}. What are you in the mood for—coffee, lunch, or a detour to dessert?`;
  }
  if (/hungry|starving|food|eat|eats|lunch|dinner|snack/i.test(q)) {
    return `Same! I can’t eat for you, but I can point you to the tastiest nearby. Craving cosy, quick bites, or outdoors-y?`;
  }
  if (/suggest|recommend|pick\s*(one|something)?|choose\s*(one|for me)?/i.test(q) && topRecommendation?.title) {
    return `I’d pick my fave nearby: ${topRecommendation.title}${topRecommendation.subtitle ? ` (${topRecommendation.subtitle})` : ''} — ${topRecommendation.rating ?? 'no rating yet'}/5, ${distText}${priceText ? ` · ${priceText}` : ''}. Want a backup option or a different vibe?`;
  }
  if (/deal|deals|discount|offer|special|promo/i.test(q)) {
    return `I’m on the hunt for bargains near ${landmarkText}. Fancy food, drinks, or shopping steals?`;
  }
  if (/coffee|espresso|latte|cappuccino/i.test(q)) {
    return `I smell beans! Closest caffeine hits coming up. Want best-in-class, work-friendly, or grab-and-go?`;
  }
  if (/thai|sushi|japanese|chinese|indian|vegan|vegetarian|pizza|burger|taco|mexican|korean/i.test(q)) {
    return `I’ve got ${query} spots near ${landmarkText}. Need spicy, mild, or veg-friendly? I can sort by distance or price.`;
  }
  if (/qvb|town hall|darling|hyde park|museum|cbd/i.test(q)) {
    return `You’re near ${landmarkText}. Let’s keep it close. Prefer quick bites, sit-down, or treats to-go?`;
  }
  if (/gym|fitness|workout|yoga|pilates/i.test(q)) {
    return `I don’t see gyms nearby yet. I can keep an eye out, or show closest options to work off calories (stairs > treadmill). Want alternatives like yoga/pilates if they pop up?`;
  }
  if (/kids|family|date|friends|group/i.test(q)) {
    return `For that vibe near ${landmarkText}, I’ll keep it friendly. Want cosy, lively, or quiet?`;
  }
  if (/fast|quick|10\s*min|min/i.test(q) || /cheap|budget|affordable/i.test(q)) {
    return `Speed run mode: closest picks near ${landmarkText} and under budget. Want fastest walk or best value within 10 minutes?`;
  }
  if (/route|navigation|take me there|directions/i.test(q)) {
    return `Got it. I’ll map you from here to there. Want me to start navigation or just show the route preview?`;
  }
  return `Here are a few ideas near ${landmarkText}. Want a vibe? cosy, quick bites, or outdoors-y?`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query: string = String(body?.query ?? '').slice(0, 200);
    const userLocation = body?.userLocation as { lat: number; lng: number } | null | undefined;
    const history = Array.isArray(body?.history)
      ? (body.history as { role: 'user' | 'assistant'; content: string }[])
      : [];
    const entryContext: AIEntryContext =
      body?.entryContext && typeof body.entryContext === 'object'
        ? (body.entryContext as AIEntryContext)
        : { type: 'fresh' };

    // Build cache key
    const cacheKey = JSON.stringify({
      q: query,
      loc: userLocation ? { lat: Number(userLocation.lat.toFixed(5)), lng: Number(userLocation.lng.toFixed(5)) } : null,
      ec: entryContext,
    });
    const cached = aiCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      console.log('🤖 AI cache hit', { query });
      return NextResponse.json(cached.data);
    }

    // Fetch all places from database along with deals/events to allow a mixed list
    const [businesses, deals, events] = await Promise.all([
      getPlaces(),
      getDeals(),
      getEvents(),
    ]);

    // Find nearest landmark for context
    const nearestLandmark = findNearestLandmark(userLocation || null, businesses);
    const locationRef = nearestLandmark || 'Sydney CBD';

    // Availability flags for smarter chips/messages
    const now = new Date();
    const hasDeals = deals.some((d) => d.isLive && new Date(d.endsAt) >= now);
    const hasEvents = events.some((e) => e.isLive && new Date(e.endsAt) >= now);
    const hasFitness = businesses.some((b) => b.category.toLowerCase().includes('fitness') || b.name.toLowerCase().includes('fitness'));

    console.log('🤖 AI Search (mistral):', { query, userLocation, nearestLandmark, locationRef, entryContext });

    // Always use AI for conversational search
    const ai = await aiSearch(
      query,
      businesses,
      deals,
      events,
      history,
      entryContext,
      userLocation || null,
      nearestLandmark,
    );
    if (ai) {
      aiCache.set(cacheKey, { ts: Date.now(), data: ai });
      return NextResponse.json(ai satisfies AIServerPayload);
    }

    // Light small-talk handling to keep tone human and location-aware when AI parsing fails
    const isSmallTalk = !query || /^(hi|hey|hello|yo|hiya|sup|what's up|gday|g’d?ay)/i.test(query.trim());
    const sortedNearby = [...businesses].sort((a, b) => {
      if (!userLocation) return 0;
      return calculateDistance(userLocation, { lat: a.lat, lng: a.lng }) - calculateDistance(userLocation, { lat: b.lat, lng: b.lng });
    });
    if (isSmallTalk) {
      const top = sortedNearby.slice(0, 3);
      const recommendations = top.map((b) => ({
        type: 'place' as const,
        id: b.id,
        title: b.name,
        subtitle: b.category,
        distanceMeters: userLocation ? calculateDistance(userLocation, { lat: b.lat, lng: b.lng }) : undefined,
        rating: b.rating ?? null,
        ratingSource: b.rating ? 'internal' : null,
        priceRange: b.priceRange ?? null,
        extraBadges: [],
      }));
      const friendly = `Hey! You’re near ${locationRef}. What are you in the mood for—coffee, lunch, or dessert?`;
      return NextResponse.json(
        {
          source: 'fallback',
          message: friendly,
          recommendations,
          followUps: buildFollowUps(entryContext, { hasDeals, hasFitness, hasEvents }),
        } satisfies AIServerPayload,
      );
    }

    // If the user asked about deals explicitly, prioritise live deals only
    const isDealsQuery = /deal|deals|discount|offer|special|promo/i.test(query);
    if (isDealsQuery) {
      const liveDeals = deals.filter((d) => d.isLive && new Date(d.endsAt) >= now);
      const sortedDeals = liveDeals.sort((a, b) => {
        if (!userLocation) return 0;
        const aPlace = businesses.find((p) => p.id === a.placeId);
        const bPlace = businesses.find((p) => p.id === b.placeId);
        if (!aPlace || !bPlace) return 0;
        return calculateDistance(userLocation, { lat: aPlace.lat, lng: aPlace.lng }) -
          calculateDistance(userLocation, { lat: bPlace.lat, lng: bPlace.lng });
      });
      const recommendations = sortedDeals.slice(0, 12).map((d) => {
        const place = businesses.find((b) => b.id === d.placeId);
        const distanceMeters = place && userLocation
          ? calculateDistance(userLocation, { lat: place.lat, lng: place.lng })
          : undefined;
        return {
          type: 'deal' as const,
          id: d.id,
          title: d.title,
          subtitle: d.description ?? place?.name ?? undefined,
          distanceMeters,
          rating: null,
          ratingSource: null,
          extraBadges: ['Deal'],
        };
      });
      if (recommendations.length > 0) {
        const nearText = nearestLandmark ? `near ${nearestLandmark}` : 'near you';
        return NextResponse.json({
          source: 'fallback',
          message: `I’m hunting bargains ${nearText}. Food, drinks, or shopping steals?`,
          recommendations,
          followUps: [
            { id: 'food-deals', label: 'Food Deals', payload: 'food deals nearby' },
            { id: 'drinks-deals', label: 'Drink Deals', payload: 'drink deals nearby' },
            { id: 'shopping-deals', label: 'Shopping Deals', payload: 'shopping deals nearby' },
          ],
        } satisfies AIServerPayload);
      }
    }

    // AI failed or not configured: gracefully fallback to smart matching
    let fallbackBusinesses = query ? filterByQuery(query, businesses) : businesses;
    const isFitnessQuery = /fitness|gym|workout|studio|pilates|yoga/i.test(query);
    const menuIntent = /menu|serve|do they have|do they sell|what.*do they have|price|cost|opening|closing|hours/i.test(query);
    if (isFitnessQuery && fallbackBusinesses.length === 0) {
      const fitnessMatches = businesses.filter((b) =>
        b.category.toLowerCase().includes('fitness') ||
        b.category.toLowerCase().includes('gym') ||
        b.name.toLowerCase().includes('fitness') ||
        b.name.toLowerCase().includes('gym') ||
        b.name.toLowerCase().includes('studio') ||
        b.name.toLowerCase().includes('yoga') ||
        b.name.toLowerCase().includes('pilates')
      );
      fallbackBusinesses = fitnessMatches.slice(0, 12);
      if (fallbackBusinesses.length === 0) {
        const nearbyFallback = userLocation
          ? [...businesses].sort((a, b) =>
              calculateDistance(userLocation, { lat: a.lat, lng: a.lng }) -
              calculateDistance(userLocation, { lat: b.lat, lng: b.lng })
            ).slice(0, 3)
          : businesses.slice(0, 3);

        const recommendations = nearbyFallback.map((b) => ({
          type: 'place' as const,
          id: b.id,
          title: b.name,
          subtitle: b.category,
          distanceMeters: userLocation ? calculateDistance(userLocation, { lat: b.lat, lng: b.lng }) : undefined,
          rating: b.rating ?? null,
          ratingSource: b.rating ? 'internal' : null,
          priceRange: b.priceRange ?? null,
          extraBadges: [],
        }));

        return NextResponse.json({
          source: 'fallback',
          message: `I couldn’t find gyms or fitness nearby. Here are a few close picks instead—want me to find yoga or pilates if they show up later?`,
          recommendations,
          followUps: [
            { id: 'yoga', label: 'Look for Yoga later', payload: 'yoga near me' },
            { id: 'pilates', label: 'Look for Pilates later', payload: 'pilates near me' },
            ...(hasDeals ? [{ id: 'food-deals', label: 'Food Deals', payload: 'food deals nearby' }] : []),
          ],
        } satisfies AIServerPayload);
      }
    }
    // If the query was small talk and yielded nothing, surface a generic nearby list instead of an error
    if (fallbackBusinesses.length === 0) {
      fallbackBusinesses = businesses.slice(0, 12);
    }
    // Sort by distance if possible and limit to top 3 for concise reply
    if (userLocation) {
      fallbackBusinesses = [...fallbackBusinesses].sort((a, b) =>
        calculateDistance(userLocation, { lat: a.lat, lng: a.lng }) -
        calculateDistance(userLocation, { lat: b.lat, lng: b.lng })
      );
    }
    fallbackBusinesses = fallbackBusinesses.slice(0, 3);
    if (fallbackBusinesses.length > 0) {
      const recommendations = fallbackBusinesses.map((b) => ({
        type: 'place' as const,
        id: b.id,
        title: b.name,
        subtitle: b.category,
        distanceMeters: userLocation ? calculateDistance(userLocation, { lat: b.lat, lng: b.lng }) : undefined,
        rating: b.rating ?? null,
        ratingSource: b.rating ? 'internal' : null,
        priceRange: b.priceRange ?? null,
        extraBadges: [],
        _openScore: isOpenNow(b.hours) ? 1 : 0,
      }));

      // If this was a menu intent and we can match a place, add website chip and tailored message
      if (menuIntent) {
        const matchedPlace = findPlaceByName(query, businesses);
        if (matchedPlace) {
          const recs = recommendations.filter((r) => r.id === matchedPlace.id);
          const site = matchedPlace.website;
          const msg = site
            ? `I don’t have ${matchedPlace.name}'s menu handy right now. You can check their website below.`
            : `I don’t have ${matchedPlace.name}'s menu handy. Want me to suggest similar spots nearby?`;
          const payload: AIServerPayload = {
            source: 'fallback',
            message: msg,
            recommendations: recs.length ? recs : recommendations,
            followUps: [
              { id: 'similar', label: 'Find similar nearby', payload: `${matchedPlace.category} near me` },
              ...(site ? [{ id: 'open-site', label: 'Open their site', payload: site }] : []),
              { id: 'something-else', label: 'Something else', payload: 'suggest something else nearby' },
            ],
          };
          aiCache.set(cacheKey, { ts: Date.now(), data: payload });
          return NextResponse.json(payload);
        }
      }

      const best = [...recommendations].sort((a, b) => {
        const rA = a.rating ?? 0;
        const rB = b.rating ?? 0;
        if (rA !== rB) return rB - rA;
        const dA = a.distanceMeters ?? Infinity;
        const dB = b.distanceMeters ?? Infinity;
        return dA - dB;
      })[0];

      // If user asked us to pick, flag the best as "Pick"
      const isSuggestQuery = /suggest|recommend|pick\s*(one|something)?|choose\s*(one|for me)?/i.test(query);
      if (isSuggestQuery && best) {
        recommendations.forEach((r) => {
          if (r.id === best.id) {
            r.extraBadges = Array.from(new Set([...(r.extraBadges || []), 'Pick']));
          }
        });
      }

      // Apply simple scoring adjustments (distance, rating, intent-type, open now)
      const enhanceScore = (rec: any) => {
        let score = 0;
        const dist = rec.distanceMeters ?? Infinity;
        score += SCORING_WEIGHTS.distance * (dist === Infinity ? 0 : Math.max(0, 1.5 - dist / 1500));
        score += SCORING_WEIGHTS.rating * ((rec.rating ?? 0) / 5);
        score += SCORING_WEIGHTS.openNow * (rec._openScore ?? 0);
        if (/deal/i.test(query) && rec.type === 'deal') score += SCORING_WEIGHTS.typeBoost;
        if (/event|experience/i.test(query) && rec.type === 'event') score += SCORING_WEIGHTS.typeBoost;
        if (/gym|fitness|workout|yoga|pilates/i.test(query) && rec.title?.toLowerCase().includes('gym')) score += SCORING_WEIGHTS.intentMatch;
        return score;
      };

      recommendations.sort((a: any, b: any) => enhanceScore(b) - enhanceScore(a));

      const payload: AIServerPayload = {
        source: 'fallback',
        message: cheekyMessage(query, locationRef, best, nearestLandmark),
        recommendations,
        followUps: buildFollowUps(entryContext, { hasDeals, hasFitness, hasEvents }),
      };
      console.log('🤖 AI fallback branch', { query, nearestLandmark, hasDeals, hasFitness, hasEvents, recs: recommendations.length });
      aiCache.set(cacheKey, { ts: Date.now(), data: payload });
      return NextResponse.json(payload);
    }

    // If no matches either, return helpful message
    const reason = process.env.MISTRAL_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
      ? 'I had trouble understanding that.'
      : 'AI is not configured. Please add MISTRAL_API_KEY in .env.local.';
    return NextResponse.json(
      {
        source: 'fallback',
        message: `${reason} Try asking like: "I'm hungry, cheap vegan options" or "best coffee nearby".`,
        recommendations: [],
        followUps: buildFollowUps(entryContext, { hasDeals, hasFitness, hasEvents }),
      } satisfies AIServerPayload,
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: 'Unexpected error' },
      { status: 500 },
    );
  }
}
