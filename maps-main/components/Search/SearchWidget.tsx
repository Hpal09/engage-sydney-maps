"use client";

import { useState, memo } from 'react';
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

// Memoize component to prevent unnecessary re-renders (PERF-1 optimization)
const SearchWidget = memo(function SearchWidget({
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
          <div className="flex items-center gap-[9px]">
            {/* Search Input */}
            <button
              onClick={() => setIsOpen(true)}
              className="w-[226px] h-[45px] flex items-center gap-3 rounded-[25px] bg-white px-5 py-3 text-left hover:shadow-xl transition-all duration-200 border border-gray-100 hover:border-blue-400 group"
              style={{ boxShadow: '1px 1px 4px 0 rgba(0, 0, 0, 0.25)' }}
            >
              <Search className="h-5 w-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
              <span className="text-[11px] leading-[100%] text-gray-600 font-normal">{keyword || 'Search places, deals, events...'}</span>
            </button>

            {/* AI Mode Button */}
            <button
              onClick={onOpenAI}
              className="w-[113px] h-[45px] flex items-center justify-center rounded-[25px] bg-gradient-to-r from-[#FF0094] to-[#7616FF] px-[22px] py-[9px] text-white hover:opacity-90 transition-all duration-200 whitespace-nowrap"
              style={{ filter: 'drop-shadow(1px 1px 4px rgba(0, 0, 0, 0.25))' }}
            >
              <span className="text-[16px] leading-[100%] font-bold text-center">AI Mode</span>
            </button>
          </div>

          {/* Toggle Tabs - Multi-select */}
          <div className="inline-flex justify-center items-center gap-[13px] overflow-x-auto pb-1 scrollbar-hide">
            {TOGGLE_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabToggle(tab.id)}
                className={`flex w-[107px] px-[21px] py-[10px] justify-center items-center gap-[10px] rounded-[17px] border transition-all ${
                  activeTabs.has(tab.id)
                    ? 'bg-[#0096FA] text-white border-[#0096FA] shadow-lg shadow-blue-200'
                    : 'bg-white text-[#707070] border-[#DADADA] hover:bg-[#0096FA] hover:text-white hover:border-[#0096FA]'
                }`}
              >
                <span className="text-[12px] font-medium leading-normal text-center">
                  {tab.label}
                </span>
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
            <div className="inline-flex justify-center items-center gap-[13px] overflow-x-auto pb-1 scrollbar-hide">
              {TOGGLE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => onTabToggle(tab.id)}
                  className={`flex w-[107px] px-[21px] py-[10px] justify-center items-center gap-[10px] rounded-[17px] border transition-all ${
                    activeTabs.has(tab.id)
                      ? 'bg-[#0096FA] text-white border-[#0096FA] shadow-lg shadow-blue-200'
                      : 'bg-white text-[#707070] border-[#DADADA] hover:bg-[#0096FA] hover:text-white hover:border-[#0096FA]'
                  }`}
                >
                  <span className="text-[12px] font-medium leading-normal text-center">
                    {tab.label}
                  </span>
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
});

export default SearchWidget;
