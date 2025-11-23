"use client";

import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { ReactNode } from 'react';

interface Props {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onRecenter?: () => void;
  followMe?: boolean;
  onToggleFollowMe?: () => void;
  children?: ReactNode;
}

// Google Maps-style location icon component
function LocationIcon({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer circle with lighter fill */}
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2"/>
      {/* Inner circle */}
      <circle cx="12" cy="12" r="4" fill="currentColor"/>
      {/* Top crosshair */}
      <path d="M12 2 L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      {/* Bottom crosshair */}
      <path d="M12 18 L12 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      {/* Left crosshair */}
      <path d="M2 12 L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      {/* Right crosshair */}
      <path d="M18 12 L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export default function MapControls({ onZoomIn, onZoomOut, onReset, onRecenter, followMe, onToggleFollowMe, children }: Props) {
  return (
    <div className="absolute right-4 top-4 z-20 flex flex-col items-center gap-2">
      <button
        aria-label="Zoom in"
        onClick={onZoomIn}
        className="rounded bg-white/90 p-2 shadow hover:bg-white"
      >
        <ZoomIn className="h-5 w-5" />
      </button>
      <button
        aria-label="Zoom out"
        onClick={onZoomOut}
        className="rounded bg-white/90 p-2 shadow hover:bg-white"
      >
        <ZoomOut className="h-5 w-5" />
      </button>
      <button
        aria-label="Reset view"
        onClick={onReset}
        className="rounded bg-white/90 p-2 shadow hover:bg-white"
      >
        <Maximize2 className="h-5 w-5" />
      </button>
      {onRecenter && (
        <button
          aria-label="Recenter on me"
          onClick={onRecenter}
          className="rounded bg-white/90 p-2 shadow hover:bg-white active:bg-blue-100"
        >
          <LocationIcon className="text-gray-700 hover:text-blue-600" />
        </button>
      )}
      {onToggleFollowMe && (
        <button
          aria-label="Toggle follow me"
          onClick={onToggleFollowMe}
          className={`rounded px-3 py-1 text-xs shadow ${followMe ? 'bg-blue-600 text-white' : 'bg-white/90 hover:bg-white'}`}
        >
          {followMe ? 'Following' : 'Follow me'}
        </button>
      )}
      {children}
    </div>
  );
}


