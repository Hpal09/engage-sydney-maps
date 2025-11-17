import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Business, SearchResult } from '@/types';

const API_KEY = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;

function extractJson(text: string): SearchResult | null {
  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const raw = fenced ? fenced[1] : text;
    return JSON.parse(raw);
  } catch (_) {
    try {
      const first = text.indexOf('{');
      const last = text.lastIndexOf('}');
      if (first >= 0 && last > first) {
        return JSON.parse(text.slice(first, last + 1));
      }
    } catch (_) {
      return null;
    }
    return null;
  }
}

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export async function aiSearch(
  query: string, 
  businesses: Business[], 
  history: ChatMessage[] = [],
  userLocation?: { lat: number; lng: number } | null,
  nearestLandmark?: string | null
): Promise<SearchResult | null> {
  if (!API_KEY) return null;
  try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const categories = Array.from(new Set(businesses.map((b) => b.category))).join(', ');

    const convo = history
      .slice(-6)
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    // Build location context
    const locationContext = nearestLandmark 
      ? `The user is currently near ${nearestLandmark} in Sydney CBD.`
      : userLocation
      ? `The user is in Sydney CBD.`
      : `The user is exploring Sydney CBD area.`;

    const prompt = `You are a concise, helpful food and location guide for Sydney CBD.\n\n` +
      `${locationContext}\n\n` +
      `Conversation history (if any):\n${convo}\n\n` +
      `Goal: Interpret the latest query and select relevant food categories and optional priceRange.\n` +
      `Categories available: [${categories}]\n` +
      `Price ranges: '$', '$$', '$$$', '$$$$'\n` +
      `In your response, reference the user's location (${nearestLandmark || 'Sydney CBD'}) naturally, not UTS.\n` +
      `Return ONLY JSON with this exact schema (no extra text): {\n` +
      `  "response": string,\n  "categories": string[],\n  "keywords": string[],\n  "priceRange": "$"|"$$"|"$$$"|"$$$$"|null,\n  "intent": string\n}` +
      `\nLatest user query: "${query}"`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = extractJson(text);
    if (!parsed) return null;

    const wantedCategories: string[] = Array.isArray(parsed.categories) ? parsed.categories : [];
    const keywords: string[] = Array.isArray((parsed as any).keywords) ? (parsed as any).keywords : [];
    const priceRange: string | null = parsed.priceRange ?? null;
    const intent: string | undefined = parsed.intent ?? undefined;

    let filtered = businesses.filter((b) =>
      (wantedCategories.length ? wantedCategories.map((c) => c.toLowerCase()).includes(b.category.toLowerCase()) : false) ||
      (keywords.length ? keywords.some((k) => b.name.toLowerCase().includes(String(k).toLowerCase())) : false),
    );

    if (priceRange) {
      filtered = filtered.filter((b) => b.priceRange === priceRange);
    }

    if (filtered.length === 0 && (wantedCategories.length || keywords.length)) {
      // fallback: broader contains
      filtered = businesses.filter((b) =>
        (wantedCategories.length ? wantedCategories.some((c) => b.category.toLowerCase().includes(String(c).toLowerCase())) : false) ||
        (keywords.length ? keywords.some((k) => b.name.toLowerCase().includes(String(k).toLowerCase())) : false),
      );
    }

    filtered = Array.from(new Map(filtered.map((b) => [b.id, b])).values()).slice(0, 12);
    if (filtered.length === 0) return null;

    const locationRef = nearestLandmark || 'Sydney CBD';
    const payload: SearchResult = {
      response: String(parsed.response ?? `Here are some options near ${locationRef} for "${query}".`),
      businessIds: filtered.map((b) => b.id),
      businesses: filtered,
      followupQuestions: [
        `Which one is closest to me?`,
        'Any vegetarian or vegan options?',
        'Show only cheap eats',
      ],
      categories: wantedCategories,
      priceRange: priceRange as '$' | '$$' | '$$$' | '$$$$' | null,
      intent,
    };
    return payload;
  } catch (_) {
    return null;
  }
}


