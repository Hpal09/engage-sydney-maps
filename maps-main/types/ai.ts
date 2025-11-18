export type AIRecommendationType = 'place' | 'deal' | 'event';

export type AIRecommendation = {
  type: AIRecommendationType;
  id: string;
  title: string;
  subtitle?: string;
  distanceMeters?: number;
  rating?: number | null;
  ratingSource?: 'google' | 'internal' | null;
  priceRange?: '$' | '$$' | '$$$' | '$$$$' | null;
  extraBadges?: string[];
};

export type AIFollowUpChip = {
  id: string;
  label: string;
  payload: string;
};

export type AIServerPayload = {
  source: 'ai' | 'fallback';
  message: string;
  recommendations: AIRecommendation[];
  followUps: AIFollowUpChip[];
};

export type AIEntryContext =
  | { type: 'fresh' }
  | { type: 'query'; query: string }
  | { type: 'category'; category: string }
  | { type: 'subcategory'; category: string; subcategory: string; filters?: string[] };

export type AIFilters = {
  response: string;
  intent: 'browse' | 'ask_info' | 'navigate' | 'unknown';
  categories?: string[];
  keywords?: string[];
  priceRange?: { min?: number; max?: number };
  timeOfDay?: 'breakfast' | 'lunch' | 'dinner' | 'late-night' | 'any';
  vibes?: string[];
};
