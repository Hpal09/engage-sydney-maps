"use client";

import { Sparkles, Search, X, MapPin, Tag as TagIcon, Star } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

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

const TABS: { id: TabType; label: string }[] = [
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
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
        setShowSuggestions(false);
        if (!keyword) {
          setIsExpanded(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [keyword]);

  const handleSelectSuggestion = (name: string, placeId: string) => {
    onKeywordChange(name);
    setShowSuggestions(false);
    onSelectPlace?.(placeId);
  };

  const handleClear = () => {
    onKeywordChange('');
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleSearchFocus = () => {
    setIsExpanded(true);
    setShowSuggestions(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setShowSuggestions(true);
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
        setShowSuggestions(false);
        if (!keyword) {
          setIsExpanded(false);
        }
        break;
    }
  };

  return (
    <div className="w-full max-w-xl" ref={containerRef}>
      {/* Compact Search Bar */}
      <div className="flex items-center gap-2">
        {/* Expandable Search Input */}
        <div className="flex-1 relative">
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
                setShowSuggestions(true);
              }}
              onFocus={handleSearchFocus}
              onKeyDown={handleKeyDown}
              placeholder="Search"
              className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 pl-11 pr-10 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
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

          {/* Suggestions Dropdown - Only show when expanded and have suggestions */}
          {isExpanded && showSuggestions && filteredSuggestions.length > 0 && (
            <div className="absolute z-50 mt-2 max-h-80 w-full overflow-auto rounded-2xl border bg-white shadow-xl">
              <div className="py-2">
                <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Suggestions
                </div>
                <ul>
                  {filteredSuggestions.map((suggestion, index) => (
                    <li key={suggestion.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectSuggestion(suggestion.name, suggestion.id)}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        className={`w-full px-4 py-3 text-left transition-colors flex items-start gap-3 ${
                          index === highlightedIndex
                            ? 'bg-blue-50 text-blue-900'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <MapPin className={`h-4 w-4 flex-shrink-0 mt-0.5 ${
                          index === highlightedIndex ? 'text-blue-600' : 'text-gray-400'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{suggestion.name}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <TagIcon className="h-3 w-3" />
                            {suggestion.category}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* AI Mode Button - Compact in header */}
        <button
          onClick={onOpenAI}
          className="flex items-center gap-2 rounded-2xl border-2 border-purple-300 bg-gradient-to-r from-purple-50 to-blue-50 px-4 py-3 text-sm font-semibold text-purple-700 transition-all hover:border-purple-400 hover:from-purple-100 hover:to-blue-100 whitespace-nowrap"
        >
          <Sparkles className="h-4 w-4" />
          <span>AI Mode</span>
        </button>
      </div>

      {/* Expanded Content - Tabs and Lost AI prompt */}
      {isExpanded && (
        <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Tabs */}
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

          {/* Lost? Let AI guide you */}
          <div className="text-sm text-gray-600 text-center py-2">
            <button
              onClick={onOpenAI}
              className="text-purple-700 font-semibold hover:text-purple-800 inline-flex items-center gap-1"
            >
              Lost? Let AI guide you
              <Sparkles className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
