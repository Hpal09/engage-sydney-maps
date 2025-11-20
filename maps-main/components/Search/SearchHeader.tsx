"use client";

import { ChevronDown, Sparkles, Search, X } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { PLACE_CATEGORIES } from '@/lib/categories';

type TabType = 'all' | 'deals' | 'events' | 'experiences' | 'places';

interface Props {
  keyword: string;
  onKeywordChange: (value: string) => void;
  selectedCategory: string;
  onCategoryChange: (value: string) => void;
  selectedTab: TabType;
  onTabChange: (tab: TabType) => void;
  onOpenAI: () => void;
  suggestions?: Array<{ id: string; name: string; category: string }>;
  onSelectPlace?: (placeId: string) => void;
}

const CATEGORIES = ['All categories', ...PLACE_CATEGORIES];

const TABS: { id: TabType; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'places', label: 'Places' },
  { id: 'deals', label: 'Deals' },
  { id: 'events', label: 'Events' },
  { id: 'experiences', label: 'Experiences' },
];

export default function SearchHeader({
  keyword,
  onKeywordChange,
  selectedCategory,
  onCategoryChange,
  selectedTab,
  onTabChange,
  onOpenAI,
  suggestions = [],
  onSelectPlace,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState(suggestions);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter suggestions based on keyword
  useEffect(() => {
    if (!keyword.trim()) {
      const topSuggestions = suggestions.slice(0, 10);
      setFilteredSuggestions(prev => {
        // Only update if different to avoid infinite loop
        if (JSON.stringify(prev) !== JSON.stringify(topSuggestions)) {
          return topSuggestions;
        }
        return prev;
      });
      return;
    }

    const searchTerm = keyword.toLowerCase();
    const filtered = suggestions
      .filter(s =>
        s.name.toLowerCase().includes(searchTerm) ||
        s.category.toLowerCase().includes(searchTerm)
      )
      .slice(0, 10); // Limit to 10 results

    setFilteredSuggestions(prev => {
      // Only update if different to avoid infinite loop
      if (JSON.stringify(prev) !== JSON.stringify(filtered)) {
        return filtered;
      }
      return prev;
    });
    setHighlightedIndex(0);
  }, [keyword, suggestions]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectSuggestion = (name: string, placeId: string) => {
    onKeywordChange(name);
    setIsOpen(false);
    onSelectPlace?.(placeId);
  };

  const handleClear = () => {
    onKeywordChange('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < filteredSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredSuggestions[highlightedIndex]) {
          handleSelectSuggestion(filteredSuggestions[highlightedIndex].name, filteredSuggestions[highlightedIndex].id);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  return (
    <div className="w-full max-w-xl space-y-3">
      {/* Row 1: Keyword search + Category filter */}
      <div className="flex items-center gap-2">
        {/* Keyword search input with predictive search */}
        <div className="flex-1 relative" ref={containerRef}>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              ref={inputRef}
              type="text"
              value={keyword}
              onChange={(e) => {
                onKeywordChange(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder="Search for places, deals, events..."
              className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 pl-11 pr-10 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
            {keyword && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Suggestions Dropdown */}
          {isOpen && filteredSuggestions.length > 0 && (
            <div className="absolute z-50 mt-2 max-h-64 w-full overflow-auto rounded-2xl border bg-white shadow-lg">
              <ul className="py-2">
                {filteredSuggestions.map((suggestion, index) => (
                  <li key={suggestion.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectSuggestion(suggestion.name, suggestion.id)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={`w-full px-4 py-2.5 text-left transition-colors ${
                        index === highlightedIndex
                          ? 'bg-blue-50 text-blue-900'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-medium text-sm">{suggestion.name}</div>
                      <div className="text-xs text-gray-500">{suggestion.category}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Category dropdown */}
        <div className="relative">
          <select
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="appearance-none rounded-2xl border border-gray-300 bg-white pl-4 pr-10 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 cursor-pointer"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        </div>
      </div>

      {/* Row 2: Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              selectedTab === tab.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Row 3: AI Mode button */}
      <button
        onClick={onOpenAI}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-purple-300 bg-gradient-to-r from-purple-50 to-blue-50 px-4 py-3 text-sm font-semibold text-purple-700 transition-all hover:border-purple-400 hover:from-purple-100 hover:to-blue-100"
      >
        <Sparkles className="h-5 w-5" />
        <span>Lost? Let AI guide you</span>
      </button>
    </div>
  );
}
