"use client";

import { useState } from 'react';
import { Search, X, Sparkles, ChevronDown } from 'lucide-react';
import SearchResults from './SearchResults';
import type { Business, DeviceLocation } from '@/types';
import type { Deal, Event } from '@/lib/dataService';
import { PLACE_CATEGORIES } from '@/lib/categories';

type ToggleTabType = 'deals' | 'events' | 'experiences';

interface Props {
  keyword: string;
  onKeywordChange: (value: string) => void;
  selectedCategory: string;
  onCategoryChange: (value: string) => void;
  activeTabs: Set<ToggleTabType>;
  onTabToggle: (tab: ToggleTabType) => void;
  onOpenAI: () => void;
  allPlaces: Business[];
  filteredPlaces: Business[];
  deals: Deal[];
  events: Event[];
  userLocation?: DeviceLocation;
  onSelectPlace: (placeId: string) => void;
}

const CATEGORIES = ['All categories', ...PLACE_CATEGORIES];

const TOGGLE_TABS: { id: ToggleTabType; label: string }[] = [
  { id: 'deals', label: 'Deals' },
  { id: 'events', label: 'Events' },
  { id: 'experiences', label: 'Experiences' },
];

export default function SearchWidget({
  keyword,
  onKeywordChange,
  selectedCategory,
  onCategoryChange,
  activeTabs,
  onTabToggle,
  onOpenAI,
  allPlaces,
  filteredPlaces,
  deals,
  events,
  userLocation,
  onSelectPlace,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState<Set<string>>(new Set());

  const handleAddToList = (placeId: string) => {
    setSavedPlaces(prev => {
      const newSet = new Set(prev);
      if (newSet.has(placeId)) {
        newSet.delete(placeId);
      } else {
        newSet.add(placeId);
      }
      return newSet;
    });
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleSelectPlace = (placeId: string) => {
    onSelectPlace(placeId);
    setIsOpen(false);
  };

  // Determine which tab to pass to SearchResults (for display purposes)
  const displayTab = activeTabs.size === 0 ? 'places' :
    activeTabs.has('deals') ? 'deals' :
    activeTabs.has('events') ? 'events' :
    activeTabs.has('experiences') ? 'experiences' : 'places';

  return (
    <>
      {!isOpen ? (
        /* Compact Search Bar - Show when closed */
        <div className="w-full max-w-xl space-y-3">
          <div className="flex items-center gap-3">
            {/* Search Input */}
            <button
              onClick={() => setIsOpen(true)}
              className="flex-1 flex items-center gap-3 rounded-full bg-white px-5 py-3.5 text-sm text-left shadow-lg hover:shadow-xl transition-all duration-200 border border-gray-100 hover:border-blue-400 group"
            >
              <Search className="h-5 w-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
              <span className="text-gray-600 font-medium">{keyword || 'Search places, deals, events...'}</span>
            </button>

            {/* AI Mode Button */}
            <button
              onClick={onOpenAI}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg hover:shadow-xl hover:from-purple-700 hover:to-blue-700 transition-all duration-200 whitespace-nowrap"
            >
              <Sparkles className="h-4 w-4" />
              <span>AI Mode</span>
            </button>
          </div>

          {/* Toggle Tabs - Multi-select */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {TOGGLE_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabToggle(tab.id)}
                className={`whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
                  activeTabs.has(tab.id)
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Search Widget Modal - Same size as AI chat */
        <div className="w-full max-w-xl h-[70vh] rounded-3xl border border-gray-200 bg-white shadow-2xl overflow-hidden flex flex-col">
          {/* Header with Search Input */}
          <div className="border-b border-gray-100 bg-gradient-to-b from-white to-gray-50 px-5 py-4 space-y-3 flex-shrink-0">
            {/* Search Bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => onKeywordChange(e.target.value)}
                  placeholder="Search places, deals, events..."
                  autoFocus
                  className="w-full rounded-full border border-gray-200 bg-white px-4 py-3 pl-12 pr-10 text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                />
                {keyword && (
                  <button
                    type="button"
                    onClick={() => onKeywordChange('')}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <button
                onClick={handleClose}
                className="p-2.5 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* AI Mode Prompt */}
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => {
                  handleClose();
                  onOpenAI();
                }}
                className="text-purple-600 font-semibold hover:text-purple-700 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-purple-50 transition-all"
              >
                <Sparkles className="h-4 w-4" />
                <span className="text-sm">Lost? Let AI guide you</span>
              </button>
            </div>

            {/* Toggle Tabs - Multi-select */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {TOGGLE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => onTabToggle(tab.id)}
                  className={`whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
                    activeTabs.has(tab.id)
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                      : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Category Dropdown */}
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => onCategoryChange(e.target.value)}
                className="w-full appearance-none rounded-full border border-gray-200 bg-white pl-4 pr-10 py-3 text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 cursor-pointer transition-all hover:border-gray-300"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            </div>
          </div>

          {/* Results Area - Scrollable */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <SearchResults
              places={filteredPlaces}
              deals={deals}
              events={events}
              userLocation={userLocation}
              selectedTab={displayTab}
              onSelectPlace={handleSelectPlace}
              onAddToList={handleAddToList}
            />
          </div>
        </div>
      )}
    </>
  );
}
