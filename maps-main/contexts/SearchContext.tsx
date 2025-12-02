"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { Business } from '@/types';
import type { Deal, Event } from '@/lib/dataService';
import { useDebounce } from '@/hooks/useDebounce';
import { useFilteredPlaces } from '@/hooks/useFilteredPlaces';
import type { AIEntryContext } from '@/types/ai';

/**
 * PERF-1: Search Context
 * Manages all search-related state: keywords, categories, filters, AI mode
 */

interface SearchContextType {
  // Raw search state
  keyword: string;
  setKeyword: (keyword: string) => void;
  debouncedKeyword: string;
  
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  
  activeTabs: Set<'deals' | 'events' | 'experiences'>;
  handleTabToggle: (tab: 'deals' | 'events' | 'experiences') => void;
  
  nearMeOnly: boolean;
  setNearMeOnly: (enabled: boolean) => void;
  
  // AI mode
  aiMode: boolean;
  setAiMode: (enabled: boolean) => void;
  pendingQuery: string | undefined;
  setPendingQuery: (query: string | undefined) => void;
  aiEntryContext: AIEntryContext;
  
  // Filtered results
  filteredPlaces: Business[];
  dealsByPlaceId: Map<string, Deal[]>;
  eventsByPlaceId: Map<string, Event[]>;
  visibleBusinesses: Business[];
  
  // Callbacks
  handleExitAi: () => void;
}

const SearchContext = createContext<SearchContextType | null>(null);

export function useSearch() {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error('useSearch must be used within SearchProvider');
  }
  return context;
}

interface SearchProviderProps {
  children: ReactNode;
  allPlaces: Business[];
  allDeals: Deal[];
  allEvents: Event[];
  userLocation?: import('@/types').DeviceLocation;
  upcomingEventsCount: number;
}

export function SearchProvider({ 
  children, 
  allPlaces, 
  allDeals, 
  allEvents, 
  userLocation,
  upcomingEventsCount,
}: SearchProviderProps) {
  // Search state
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebounce(keyword, 300);
  
  const [selectedCategory, setSelectedCategory] = useState('All categories');
  const [activeTabs, setActiveTabs] = useState<Set<'deals' | 'events' | 'experiences'>>(new Set());
  const [nearMeOnly, setNearMeOnly] = useState(false);
  
  // AI mode state
  const [aiMode, setAiMode] = useState(false);
  const [pendingQuery, setPendingQuery] = useState<string | undefined>(undefined);
  
  // Tab toggle handler
  const handleTabToggle = useCallback((tab: 'deals' | 'events' | 'experiences') => {
    setActiveTabs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tab)) {
        newSet.delete(tab);
      } else {
        newSet.add(tab);
      }
      return newSet;
    });
  }, []);
  
  // AI entry context
  const aiEntryContext: AIEntryContext = (() => {
    if (debouncedKeyword.trim()) return { type: 'query', query: debouncedKeyword.trim() };
    if (selectedCategory && selectedCategory !== 'All categories') {
      return { type: 'category', category: selectedCategory };
    }
    if (activeTabs.has('deals')) return { type: 'category', category: 'deals' };
    if (activeTabs.has('events') || activeTabs.has('experiences')) return { type: 'category', category: 'events' };
    return { type: 'fresh' };
  })();
  
  // Exit AI mode
  const handleExitAi = useCallback(() => {
    setAiMode(false);
    setPendingQuery(undefined);
  }, []);
  
  // Use filtering hook
  const { filteredPlaces, dealsByPlaceId, eventsByPlaceId } = useFilteredPlaces({
    allPlaces,
    allDeals,
    allEvents,
    debouncedKeyword,
    selectedCategory,
    activeTabs,
    nearMeOnly,
    userLocation,
  });
  
  const visibleBusinesses = filteredPlaces;
  
  const value: SearchContextType = {
    keyword,
    setKeyword,
    debouncedKeyword,
    selectedCategory,
    setSelectedCategory,
    activeTabs,
    handleTabToggle,
    nearMeOnly,
    setNearMeOnly,
    aiMode,
    setAiMode,
    pendingQuery,
    setPendingQuery,
    aiEntryContext,
    filteredPlaces,
    dealsByPlaceId,
    eventsByPlaceId,
    visibleBusinesses,
    handleExitAi,
  };
  
  return (
    <SearchContext.Provider value={value}>
      {children}
    </SearchContext.Provider>
  );
}

