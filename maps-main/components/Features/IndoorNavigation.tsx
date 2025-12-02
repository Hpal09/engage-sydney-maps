"use client";

import { useEffect } from 'react';
import { useNavigation } from '@/contexts/NavigationContext';
import { useMap } from '@/contexts/MapContext';
import { findPathBetweenPOIs, findMultiFloorPath, clearIndoorGraphCache } from '@/lib/indoorPathfinding';
import { buildHybridGraph, findHybridRoute } from '@/lib/hybridPathfinding';

/**
 * PERF-1: Indoor Navigation Component
 * Handles indoor pathfinding, floor SVG loading, and hybrid navigation
 * Extracted from main Page component
 */

export default function IndoorNavigation() {
  const navigation = useNavigation();
  const map = useMap();

  // Load SVG content for all floors when building data loads
  useEffect(() => {
    if (!navigation.indoorModeActive || !navigation.buildingData?.floors) {
      map.setAllFloorSvgContent(new Map());
      map.setCurrentFloorSvgContent('');
      return;
    }

    // Load SVG for all floors
    const loadPromises = navigation.buildingData.floors.map(async (floor: any) => {
      if (!floor.svgPath) return { floorId: floor.id, content: '' };
      try {
        const response = await fetch(floor.svgPath);
        const content = await response.text();
        return { floorId: floor.id, content };
      } catch (err) {
        console.error(`Failed to load SVG for floor ${floor.id}:`, err);
        return { floorId: floor.id, content: '' };
      }
    });

    Promise.all(loadPromises).then(results => {
      const svgMap = new Map<string, string>();
      results.forEach(({ floorId, content }) => {
        if (content) svgMap.set(floorId, content);
      });
      map.setAllFloorSvgContent(svgMap);
      console.log(`📄 Loaded SVG content for ${svgMap.size} floors`);
    });
  }, [navigation.indoorModeActive, navigation.buildingData]); // Fixed: Removed 'map' from dependencies

  // Clear indoor graph cache when exiting indoor mode
  useEffect(() => {
    if (!navigation.indoorModeActive) {
      clearIndoorGraphCache();
    }
  }, [navigation.indoorModeActive]);

  // Update current floor SVG when selected floor changes
  useEffect(() => {
    if (!navigation.selectedFloorId) {
      map.setCurrentFloorSvgContent('');
      return;
    }
    const content = map.allFloorSvgContent.get(navigation.selectedFloorId) || '';
    map.setCurrentFloorSvgContent(content);
  }, [navigation.selectedFloorId, map.allFloorSvgContent]); // Fixed: Removed 'map' from dependencies

  // Load building entrances for hybrid navigation
  useEffect(() => {
    async function loadBuildingEntrances() {
      try {
        const res = await fetch('/api/buildings/entrances');
        const data = await res.json();
        navigation.setBuildingEntrances(data.entrances || []);
        console.log(`🚪 Loaded ${data.entrances?.length || 0} building entrances`);
      } catch (error) {
        console.error('Failed to load building entrances:', error);
      }
    }
    loadBuildingEntrances();
  }, []); // Fixed: Removed 'navigation' from dependencies - should only run once on mount

  // Build hybrid graph when components ready
  useEffect(() => {
    if (!navigation.pathGraph || navigation.buildingEntrances.length === 0 || map.allFloorSvgContent.size === 0) {
      return;
    }

    async function buildHybrid() {
      try {
        if (!navigation.pathGraph) return;

        console.log('🔧 Building hybrid navigation graph...');

        // Convert outdoor graph format
        const outdoorGraphMap = new Map();
        Object.entries(navigation.pathGraph.nodesById).forEach(([id, node]) => {
          const edges = new Map();
          const adjacentEdges = navigation.pathGraph!.adjacency[id] || [];
          adjacentEdges.forEach((edge: any) => {
            edges.set(edge.to, edge.distance);
          });

          outdoorGraphMap.set(id, {
            ...node,
            edges,
          });
        });

        // Build indoor graphs
        const indoorGraphs = new Map();
        const buildingIds = [...new Set(navigation.buildingEntrances.map(e => e.buildingId))];

        for (const buildingId of buildingIds) {
          const floors: Array<{floorId: string; svgContent: string}> = [];
          const buildingEntranceFloors = navigation.buildingEntrances
            .filter(e => e.buildingId === buildingId)
            .map(e => e.floorId);

          for (const floorId of new Set(buildingEntranceFloors)) {
            const svgContent = map.allFloorSvgContent.get(floorId);
            if (svgContent) {
              floors.push({ floorId, svgContent });
            }
          }

          if (floors.length > 0) {
            try {
              const { parseSvgPaths, buildMultiFloorGraph } = await import('@/lib/indoorPathfinding');
              const floorData = floors.map(floor => {
                const segments = parseSvgPaths(floor.svgContent);
                return { floorId: floor.floorId, segments, svgContent: floor.svgContent };
              });

              const indoorGraph = buildMultiFloorGraph(floorData);
              indoorGraphs.set(buildingId, indoorGraph);
            } catch (error) {
              console.error(`Failed to build indoor graph for building ${buildingId}:`, error);
            }
          }
        }

        const hybrid = await buildHybridGraph(
          outdoorGraphMap,
          navigation.buildingEntrances,
          indoorGraphs
        );

        navigation.setHybridGraph(hybrid);
        console.log('✅ Hybrid graph built:', hybrid.size, 'total nodes');
      } catch (error) {
        console.error('❌ Failed to build hybrid graph:', error);
      }
    }

    buildHybrid();
  }, [navigation.pathGraph, navigation.buildingEntrances, map.allFloorSvgContent]); // Fixed: Removed context objects from dependencies

  // Calculate indoor route
  useEffect(() => {
    if (!navigation.indoorNavigationStart || !navigation.indoorNavigationDestination || map.allFloorSvgContent.size === 0) {
      navigation.setIndoorRoute(null);
      return;
    }

    console.log('🗺️  Calculating indoor route');

    // Same floor pathfinding
    if (navigation.indoorNavigationStart.floorId === navigation.indoorNavigationDestination.floorId) {
      const floorSvg = map.allFloorSvgContent.get(navigation.indoorNavigationStart.floorId);
      if (!floorSvg) {
        navigation.setIndoorRoute(null);
        return;
      }

      const result = findPathBetweenPOIs(
        floorSvg,
        { x: navigation.indoorNavigationStart.x, y: navigation.indoorNavigationStart.y },
        { x: navigation.indoorNavigationDestination.x, y: navigation.indoorNavigationDestination.y }
      );

      if (result) {
        const nodesWithFloor = result.nodes.map(node => ({
          ...node,
          floorId: navigation.indoorNavigationStart.floorId,
        }));
        navigation.setIndoorRoute(nodesWithFloor);
      } else {
        navigation.setIndoorRoute(null);
      }
    } else {
      // Multi-floor pathfinding
      const floors = Array.from(map.allFloorSvgContent.entries()).map(([floorId, svgContent]) => ({
        floorId,
        svgContent,
      }));

      findMultiFloorPath(
        floors,
        {
          x: navigation.indoorNavigationStart.x,
          y: navigation.indoorNavigationStart.y,
          floorId: navigation.indoorNavigationStart.floorId,
        },
        {
          x: navigation.indoorNavigationDestination.x,
          y: navigation.indoorNavigationDestination.y,
          floorId: navigation.indoorNavigationDestination.floorId,
        }
      ).then(result => {
        if (result) {
          navigation.setIndoorRoute(result.nodes);
        } else {
          navigation.setIndoorRoute(null);
        }
      }).catch(err => {
        console.error('Multi-floor pathfinding error:', err);
        navigation.setIndoorRoute(null);
      });
    }
  }, [navigation.indoorNavigationStart, navigation.indoorNavigationDestination, map.allFloorSvgContent]); // Fixed: Removed context objects from dependencies

  // Invisible component
  return null;
}



