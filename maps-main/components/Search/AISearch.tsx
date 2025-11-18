"use client";

import { useEffect, useRef, useState } from 'react';
import type { DeviceLocation } from '@/types';
import type { AIRecommendation, AIFollowUpChip, AIEntryContext, AIServerPayload } from '@/types/ai';
import SearchInput from './SearchInput';

interface Message {
  role: 'user' | 'assistant' | 'error';
  content: string;
}

interface Props {
  initialQuery?: string;
  hideInput?: boolean;
  userLocation?: DeviceLocation;
  onSelectPlace: (placeId: string) => void;
  onSelectDeal: (dealId: string) => void;
  onSelectEvent: (eventId: string) => void;
  onStartNavigation: (destType: 'place' | 'deal' | 'event', destId: string) => void;
  onExitAI: () => void;
  entryContext: AIEntryContext;
}

function buildInitialChips(entryContext: AIEntryContext): AIFollowUpChip[] {
  switch (entryContext.type) {
    case 'fresh':
      return [
        { id: 'lunch-deals', label: 'Lunch Deals', payload: 'lunch deals nearby' },
        { id: 'coffee-nearby', label: 'Coffee Nearby', payload: 'coffee nearby' },
        { id: 'fitness', label: 'Fitness Studios', payload: 'fitness studios near me' },
        { id: 'tonight', label: "What’s on Tonight", payload: "what's on tonight" },
      ];
    case 'query':
      return [
        { id: 'best', label: `Best ${entryContext.query}`, payload: `best ${entryContext.query}` },
        { id: 'nearby', label: `${entryContext.query} Nearby`, payload: `${entryContext.query} nearby` },
        { id: 'deals', label: `${entryContext.query} Deals`, payload: `${entryContext.query} deals` },
        { id: 'vibe', label: 'Quiet, Work friendly', payload: 'quiet work friendly' },
      ];
    case 'category':
      return [
        { id: 'brunch', label: 'Brunch & Cafes', payload: 'brunch and cafes' },
        { id: 'healthy', label: 'Healthy Eats', payload: 'healthy eats' },
        { id: 'quick', label: 'Quick & Casual', payload: 'quick casual' },
        { id: 'deals', label: 'After-Work Drink Deals', payload: 'after work drink deals' },
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

function buildInitialMessage(entryContext: AIEntryContext): string {
  const isSmallTalk = (q: string) => /^(hi|hey|hello|yo|hiya|sup|what's up|gday|g’d?ay)$/i.test(q.trim());
  switch (entryContext.type) {
    case 'query':
      if (isSmallTalk(entryContext.query)) {
        return `Hey! I’m your Sydney sidekick. What are you in the mood for—coffee, lunch, or a detour to dessert?`;
      }
      return `Hey! I’m your Sydney sidekick. You were looking for ${entryContext.query}. Want me to help narrow it down—coffee, lunch, or dessert?`;
    case 'category':
      return `Hey! I’m your Sydney sidekick. Browsing ${entryContext.category}? Pick a vibe or tell me your budget, time, or mood.`;
    case 'subcategory':
      return `Hey! I’m your Sydney sidekick. Exploring ${entryContext.category} > ${entryContext.subcategory}? Pick one or tell me what you feel like.`;
    case 'fresh':
    default:
      return `Hey! I’m your Sydney sidekick. What are you in the mood for—coffee, lunch, or a detour to dessert?`;
  }
}

export default function AISearch({
  initialQuery,
  hideInput,
  userLocation,
  onSelectPlace,
  onSelectDeal,
  onSelectEvent,
  onStartNavigation,
  onExitAI,
  entryContext,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [chips, setChips] = useState<AIFollowUpChip[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const initialQueryUsed = useRef(false);

  function animateAssistantMessage(full: string): Promise<void> {
    return new Promise((resolve) => {
      let i = 0;
      setTyping('');
      const interval = setInterval(() => {
        i += Math.max(1, Math.floor(full.length / 60));
        setTyping(full.slice(0, i));
        if (i >= full.length) {
          clearInterval(interval);
          setTyping(null);
          setMessages((prev) => [...prev, { role: 'assistant', content: full }]);
          resolve();
        }
      }, 20);
    });
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, typing, recommendations, chips]);

  // Kick off greeting / predictive chips on first mount
  useEffect(() => {
    if (initialQueryUsed.current) return;
    initialQueryUsed.current = true;
    setChips(buildInitialChips(entryContext));
    const greeting = buildInitialMessage(entryContext);
    animateAssistantMessage(greeting);
  }, [entryContext]);

  // If parent passes an initial query, run it once after greeting is set
  useEffect(() => {
    if (!initialQuery) return;
    handleSearch(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const handleView = (rec: AIRecommendation) => {
    if (rec.type === 'place') onSelectPlace(rec.id);
    if (rec.type === 'deal') onSelectDeal(rec.id);
    if (rec.type === 'event') onSelectEvent(rec.id);
  };

  const handleNavigate = (rec: AIRecommendation) => {
    onStartNavigation(rec.type, rec.id);
  };

  async function handleSearch(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setLoading(true);
    setTyping('');
    try {
      const response = await fetch('/api/ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmed,
          userLocation: userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null,
          history: messages
            .filter((m) => m.role !== 'error')
            .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
          entryContext,
        }),
      });
      if (!response.ok) throw new Error('Search failed');
      const data: AIServerPayload = await response.json();
      const full = data.message ?? '';
      const recs = data.recommendations || [];
      setRecommendations([]); // reveal after text finishes
      setChips([]); // defer follow-ups until message finishes
      await animateAssistantMessage(full);

      if (recs.length > 0) {
        let idx = 0;
        const reveal = () => {
          setRecommendations((prev) => [...prev, recs[idx]]);
          idx += 1;
          if (idx < recs.length) {
            setTimeout(reveal, 100);
          }
        };
        reveal();
      }
      setChips(data.followUps || []);
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'error', content: 'Sorry, I had trouble searching. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="font-medium">AI Assistant</div>
        <button
          className="text-sm text-gray-600 hover:text-gray-900"
          onClick={() => {
            onExitAI();
          }}
        >
          Close
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow ${
                m.role === 'user' ? 'bg-blue-600 text-white' : m.role === 'error' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-900'
              }`}
            >
              <p className="whitespace-pre-line">{m.content}</p>
            </div>
          </div>
        ))}

        {typing !== null && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-gray-100 px-4 py-3 text-sm text-gray-900 shadow whitespace-pre-wrap">{typing || ' '}</div>
          </div>
        )}

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <button
                key={chip.id}
                onClick={() => handleSearch(chip.payload)}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-800 shadow hover:bg-gray-50"
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {recommendations.length > 0 && (
          <div className="space-y-3">
            {recommendations
              .filter(Boolean)
              .map((rec) => (
              <div key={rec.id} className="rounded-2xl border bg-white p-4 shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-semibold text-sm">{rec.title}</div>
                    {rec.subtitle && <div className="text-xs text-gray-700">{rec.subtitle}</div>}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                      {typeof rec.distanceMeters === 'number' && (
                        <span>{Math.round(rec.distanceMeters)} m away</span>
                      )}
                      {typeof rec.rating === 'number' && (
                        <span>⭐ {rec.rating.toFixed(1)}</span>
                      )}
                      {rec.priceRange && (
                        <span>{rec.priceRange}</span>
                      )}
                      {rec.extraBadges?.map((badge) => (
                        <span key={badge} className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">{badge}</span>
                      ))}
                    </div>
                  </div>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase text-gray-700">
                    {rec.type}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <button
                    onClick={() => handleView(rec)}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1 font-medium text-gray-800 shadow hover:bg-gray-50"
                  >
                    View on Engage
                  </button>
                  <button
                    onClick={() => handleNavigate(rec)}
                    className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 font-medium text-blue-700 shadow hover:bg-blue-100"
                  >
                    Take me there
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
      {!hideInput && (
        <div className="border-t bg-white p-3">
          <SearchInput onSubmit={handleSearch} disabled={loading} />
        </div>
      )}
    </div>
  );
}
