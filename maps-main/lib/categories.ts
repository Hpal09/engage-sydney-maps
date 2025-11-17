export const PLACE_CATEGORIES = [
  "Food & Drink",
  "Shopping",
  "Experiences",
  "Nightlife",
  "Services",
  "Other",
] as const;

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export const EVENT_CATEGORIES = [
  "live-music",
  "food",
  "market",
  "experience",
  "other",
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

// Helper to format event category for display
export function formatEventCategory(category: string): string {
  const labels: Record<string, string> = {
    "live-music": "Live Music",
    "food": "Food",
    "market": "Market",
    "experience": "Experience",
    "other": "Other",
  };
  return labels[category] || category;
}
