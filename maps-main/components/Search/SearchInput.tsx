"use client";

import { FormEvent, useState } from 'react';

interface Props {
  placeholder?: string;
  onSubmit: (value: string) => void;
  disabled?: boolean;
}

export default function SearchInput({ placeholder = 'Find coffee, cheap eats, Chinese, ...', onSubmit, disabled }: Props) {
  const [value, setValue] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    onSubmit(v);
    setValue('');
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 rounded-xl border bg-white p-2 shadow-sm">
      <input
        className="w-full rounded-md px-3 py-2 outline-none"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
      />
      <button
        type="submit"
        className="rounded-md bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        disabled={disabled}
      >
        Search
      </button>
    </form>
  );
}


