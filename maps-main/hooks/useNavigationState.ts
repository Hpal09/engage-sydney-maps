"use client";

import { useReducer, useMemo } from 'react';
import type { PathNode } from '@/types';

/**
 * PERF-3: Navigation State Hook
 * Uses useReducer for batched navigation updates to reduce re-renders
 */

interface NavigationState {
  navMarker: { x: number; y: number; angleDeg: number } | null;
  remainingRoute: PathNode[] | null;
  routeProgress: number;
  isOffRoute: boolean;
  distanceFromRoute: number;
  currentInstruction: string;
}

type NavigationAction =
  | { type: 'UPDATE_GPS_POSITION'; payload: any }
  | { type: 'UPDATE_INSTRUCTION'; payload: string }
  | { type: 'CLEAR_NAVIGATION' }
  | { type: 'RESET_ROUTE' };

const initialState: NavigationState = {
  navMarker: null,
  remainingRoute: null,
  routeProgress: 0,
  isOffRoute: false,
  distanceFromRoute: 0,
  currentInstruction: '',
};

function navigationReducer(state: NavigationState, action: NavigationAction): NavigationState {
  switch (action.type) {
    case 'UPDATE_GPS_POSITION':
      return {
        ...state,
        ...action.payload,
      };

    case 'UPDATE_INSTRUCTION':
      return {
        ...state,
        currentInstruction: action.payload,
      };

    case 'CLEAR_NAVIGATION':
      return initialState;

    case 'RESET_ROUTE':
      return {
        ...state,
        navMarker: null,
        remainingRoute: null,
        routeProgress: 0,
        isOffRoute: false,
        distanceFromRoute: 0,
      };

    default:
      return state;
  }
}

export function useNavigationState() {
  const [state, dispatch] = useReducer(navigationReducer, initialState);

  const actions = useMemo(() => ({
    updateGPSPosition: (payload: any) => dispatch({ type: 'UPDATE_GPS_POSITION', payload }),
    updateInstruction: (instruction: string) => dispatch({ type: 'UPDATE_INSTRUCTION', payload: instruction }),
    clearNavigation: () => dispatch({ type: 'CLEAR_NAVIGATION' }),
    resetRoute: () => dispatch({ type: 'RESET_ROUTE' }),
  }), []);

  return { state, actions };
}
