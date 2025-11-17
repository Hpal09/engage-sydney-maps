"use client";

import { useState, useEffect, useRef } from 'react';
import { Search, X, MapPin } from 'lucide-react';

interface Option {
  id: string;
  label: string;
}

interface Props {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
}

export default function PredictiveSearch({ options, value, onChange, placeholder = 'Search...', label, disabled }: Props) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [filteredOptions, setFilteredOptions] = useState<Option[]>(options);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update input value when external value changes
  useEffect(() => {
    const selected = options.find(o => o.id === value);
    if (selected) {
      setInputValue(selected.label);
    } else {
      setInputValue('');
    }
  }, [value, options]);

  // Filter options based on input
  useEffect(() => {
    if (!inputValue.trim()) {
      setFilteredOptions(options);
      return;
    }

    const searchTerm = inputValue.toLowerCase();
    const filtered = options.filter(option =>
      option.label.toLowerCase().includes(searchTerm)
    );
    setFilteredOptions(filtered);
    setHighlightedIndex(0);
  }, [inputValue, options]);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setIsOpen(true);
  };

  const handleSelectOption = (option: Option) => {
    setInputValue(option.label);
    onChange(option.id);
    setIsOpen(false);
  };

  const handleClear = () => {
    setInputValue('');
    onChange('');
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
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredOptions[highlightedIndex]) {
          handleSelectOption(filteredOptions[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="mb-1 block text-xs text-gray-500">{label}</label>
      )}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
          <Search className="h-4 w-4 text-gray-400" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-2xl border px-4 py-3 pl-11 pr-10 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        {inputValue && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute z-50 mt-2 max-h-64 w-full overflow-auto rounded-2xl border bg-white shadow-lg">
          {filteredOptions.length > 0 ? (
            <ul className="py-2">
              {filteredOptions.map((option, index) => (
                <li key={option.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectOption(option)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`w-full px-4 py-2.5 text-left flex items-center gap-3 transition-colors ${
                      index === highlightedIndex
                        ? 'bg-blue-50 text-blue-900'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <MapPin className={`h-4 w-4 flex-shrink-0 ${
                      index === highlightedIndex ? 'text-blue-600' : 'text-gray-400'
                    }`} />
                    <span className="truncate">{option.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              No locations found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
