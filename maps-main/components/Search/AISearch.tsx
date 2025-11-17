"use client";

import { useEffect, useRef, useState } from 'react';
import type { Business, SearchResult, DeviceLocation } from '@/types';
import SearchInput from './SearchInput';
import { BUSINESSES } from '@/data/businesses';
import { isWithinMapBounds, calculateDistance } from '@/lib/coordinateMapper';

interface Message {
  role: 'user' | 'assistant' | 'error';
  content: string;
  businesses?: Business[];
  followupQuestions?: string[];
  categories?: string[];
}

interface Props {
  onBusinessesResult?: (businesses: Business[]) => void;
  initialQuery?: string;
  hideInput?: boolean;
  userLocation?: DeviceLocation;
}

// Generate location-aware greeting message
function getLocationAwareGreeting(userLocation?: DeviceLocation): string {
  if (!userLocation) {
    return 'Hi! What are you looking for? Try asking for coffee, restaurants, or places to visit.';
  }

  const userPos = { lat: userLocation.lat, lng: userLocation.lng };
  const withinBounds = isWithinMapBounds(userPos);

  if (!withinBounds) {
    return "You're a bit far from the Sydney CBD area right now, but I can still help you explore! Tell me what you're looking for and I'll show you the best spots.";
  }

  // Find nearest business
  let nearestBusiness: Business | null = null;
  let nearestDistance = Infinity;

  BUSINESSES.forEach(business => {
    const distance = calculateDistance(userPos, { lat: business.lat, lng: business.lng });
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestBusiness = business;
    }
  });

  if (nearestBusiness && nearestDistance < 500) { // Within 500 meters
    return `I see you're near ${(nearestBusiness as Business).name}! 📍 What are you looking for? Try asking for coffee, cheap eats, or recommendations nearby.`;
  }

  return "Welcome to Sydney CBD! 🏙️ I can help you discover great places around here. What are you craving?";
}

export default function AISearch({ onBusinessesResult, initialQuery, hideInput, userLocation }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const initialQueryUsed = useRef(false);
  const greetingSet = useRef(false);

  // Set initial greeting based on location
  useEffect(() => {
    if (!greetingSet.current) {
      greetingSet.current = true;
      const greeting = getLocationAwareGreeting(userLocation);
      setMessages([{
        role: 'assistant',
        content: greeting,
      }]);
      console.log('👋 AI Greeting:', greeting);
    }
  }, [userLocation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, typing]);

  useEffect(() => {
    if (initialQuery && !initialQueryUsed.current) {
      initialQueryUsed.current = true;
      handleSearch(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  async function handleSearch(query: string) {
    setMessages((prev) => [...prev, { role: 'user', content: query }]);
    setLoading(true);
    setTyping('');
    try {
      const response = await fetch('/api/ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          userLocation: userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null,
          history: messages
            .filter((m) => m.role !== 'error')
            .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
        }),
      });
      if (!response.ok) throw new Error('Search failed');
      const data: SearchResult = await response.json();
      const full = data.response ?? '';
      let i = 0;
      setTyping('');
      const interval = setInterval(() => {
        i += Math.max(1, Math.floor(full.length / 60));
        setTyping(full.slice(0, i));
        if (i >= full.length) {
          clearInterval(interval);
          setTyping(null);
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: full,
              businesses: data.businesses,
              followupQuestions: data.followupQuestions,
              categories: data.categories,
            },
          ]);
          if (data.businesses?.length && onBusinessesResult) onBusinessesResult(data.businesses);
        }
      }, 20);
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'error', content: 'Sorry, I had trouble searching. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow ${
                m.role === 'user' ? 'bg-blue-600 text-white' : m.role === 'error' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-900'
              }`}
            >
              <p className="whitespace-pre-line">{m.content}</p>
              {m.categories && m.categories.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {m.categories.map((c) => (
                    <span key={c} className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">{c}</span>
                  ))}
                </div>
              )}
              {m.businesses && m.businesses.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {m.businesses.slice(0, 5).map((b) => (
                    <li key={b.id} className="rounded-lg bg-white p-3 text-gray-900 shadow">
                      <div className="font-semibold">{b.name}</div>
                      <div className="text-xs text-gray-600">{b.category} • {b.priceRange ?? ''}</div>
                    </li>
                  ))}
                </ul>
              )}
              {m.followupQuestions && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.followupQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSearch(q)}
                      className="rounded-full bg-white px-3 py-1 text-xs text-gray-800 shadow hover:bg-gray-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {typing !== null && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-gray-100 px-4 py-3 text-sm text-gray-900 shadow whitespace-pre-wrap">{typing || ' '}</div>
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


