"use client";

import { useEffect, useState } from 'react';
import { useNavigation } from '@/contexts/NavigationContext';
import { useMap } from '@/contexts/MapContext';
import { buildPathNetwork } from '@/lib/graphLoader';
import { validateGraph, logValidationResult } from '@/lib/graphValidator';
import { setCalibration } from '@/lib/coordinateMapper';

/**
 * PERF-1: Data Loader Component  
 * Handles initial data loading: navigation graph, zoom config, calibration
 * Runs once on mount
 */

export default function DataLoader() {
  const navigation = useNavigation();
  const map = useMap();
  const [loaded, setLoaded] = useState(false);
  
  // Load zoom config
  useEffect(() => {
    if (loaded) return;

    (async () => {
      const zoomConfigRes = await fetch('/api/map-settings')
        .then(r => r.json())
        .catch(() => ({
          initial: 2.5,
          placeStart: 2.8,
          destination: 2.8,
          navigation: 3.0,
          navigationStart: 3.5,
        }));

      map.setZoomConfig(zoomConfigRes);
      setLoaded(true);
    })();
  }, [loaded]); // Fixed: Removed 'map' from dependencies to prevent infinite loop
  
  // Preload navigation graph
  useEffect(() => {
    (async () => {
      if (!(window as any).__SYD_GRAPH__) {
        console.log('📦 Loading navigation graph...');
        const g = await buildPathNetwork();
        (window as any).__SYD_GRAPH__ = g;
        navigation.setPathGraph(g);

        const totalEdges = Object.values(g.adjacency).reduce((a, b) => a + b.length, 0);
        console.log('✅ Graph loaded:', Object.keys(g.nodesById).length, 'nodes', totalEdges, 'edges');

        // Validate graph
        const validation = validateGraph(g);
        logValidationResult(validation);

        if (!validation.isValid) {
          console.error('⚠️  Graph validation failed! Navigation may not work correctly.');
        }
      } else {
        navigation.setPathGraph((window as any).__SYD_GRAPH__);
      }
    })();
  }, [navigation]);
  
  // Invisible component
  return null;
}



