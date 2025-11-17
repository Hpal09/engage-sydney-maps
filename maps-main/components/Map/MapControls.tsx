"use client";

import { Maximize2, Navigation, ZoomIn, ZoomOut, Play } from 'lucide-react';
import { ReactNode } from 'react';

interface Props {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onRecenter?: () => void;
  followMe?: boolean;
  onToggleFollowMe?: () => void;
  onStartTurnByTurn?: () => void;
  turnByTurnActive?: boolean;
  children?: ReactNode;
}

export default function MapControls({ onZoomIn, onZoomOut, onReset, onRecenter, followMe, onToggleFollowMe, onStartTurnByTurn, turnByTurnActive, children }: Props) {
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
          className="rounded bg-white/90 p-2 shadow hover:bg-white"
        >
          <Navigation className="h-5 w-5" />
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
      {onStartTurnByTurn && (
        <button
          aria-label="Start navigation"
          onClick={onStartTurnByTurn}
          className={`rounded bg-white/90 p-2 shadow hover:bg-white ${turnByTurnActive ? 'opacity-60' : ''}`}
        >
          <Play className="h-5 w-5" />
        </button>
      )}
      {children}
    </div>
  );
}


