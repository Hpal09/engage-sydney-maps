"use client";

import { FormEvent, useState } from 'react';

interface Props {
  placeholder?: string;
  onFocusOpen?: () => void;
  onSubmit: (value: string) => void;
  disabled?: boolean;
}

export default function OmniSearchBar({ placeholder = 'Search food near UTS…', onFocusOpen, onSubmit, disabled }: Props) {
  const [value, setValue] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    onSubmit(v);
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-3xl">
      <div className="flex items-center gap-2 rounded-full border bg-white/95 px-5 py-3 shadow-sm ring-1 ring-transparent hover:ring-blue-100 focus-within:ring-blue-300">
        <input
          className="w-full bg-transparent text-base outline-none placeholder:text-gray-400"
          placeholder={placeholder}
          value={value}
          onFocus={onFocusOpen}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
        />
        <button
          type="submit"
          className="rounded-full bg-blue-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={disabled}
        >
          Search
        </button>
      </div>
    </form>
  );
}


