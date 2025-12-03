'use client';

import { useEffect, useState } from 'react';

// DIAGNOSTIC COMPONENT - Measures memory usage
// Shows real memory consumption in browser
// REMOVE AFTER TESTING
export function MemoryProfiler() {
  const [memoryStats, setMemoryStats] = useState<{
    initial: number;
    current: number;
    peak: number;
  } | null>(null);

  useEffect(() => {
    // Check if memory API is available (Chrome/Edge only)
    if (!('memory' in performance)) {
      console.warn('Memory API not available in this browser - use Chrome or Edge');
      return;
    }

    const mem = (performance as any).memory;
    const initialMemory = mem.usedJSHeapSize;
    let peakMemory = initialMemory;

    setMemoryStats({
      initial: initialMemory,
      current: initialMemory,
      peak: peakMemory,
    });

    // Update memory stats every 2 seconds
    const interval = setInterval(() => {
      const currentMemory = mem.usedJSHeapSize;
      peakMemory = Math.max(peakMemory, currentMemory);

      setMemoryStats({
        initial: initialMemory,
        current: currentMemory,
        peak: peakMemory,
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  if (!memoryStats) {
    return (
      <div className="fixed top-4 right-4 bg-yellow-100 border-2 border-yellow-400 p-4 rounded shadow-lg z-[9999]">
        <p className="text-sm font-bold text-yellow-800">
          Memory API not available
        </p>
        <p className="text-xs text-yellow-700">Use Chrome or Edge browser for memory profiling</p>
      </div>
    );
  }

  const formatBytes = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    const gb = bytes / (1024 * 1024 * 1024);

    if (gb >= 1) {
      return { value: gb.toFixed(2), unit: 'GB', isHigh: gb > 0.5 };
    }
    return { value: mb.toFixed(1), unit: 'MB', isHigh: mb > 500 };
  };

  const initial = formatBytes(memoryStats.initial);
  const current = formatBytes(memoryStats.current);
  const peak = formatBytes(memoryStats.peak);

  const percentIncrease = ((memoryStats.current - memoryStats.initial) / memoryStats.initial * 100).toFixed(1);

  return (
    <div className="fixed top-4 right-4 bg-red-100 border-2 border-red-600 p-4 rounded shadow-lg z-[9999] min-w-[280px]">
      <div className="text-sm font-bold text-red-800 mb-2">
        🚨 MEMORY DIAGNOSTIC
      </div>

      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-700">Initial:</span>
          <span className="font-mono text-gray-900">{initial.value} {initial.unit}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-700">Current:</span>
          <span className={`font-mono ${current.isHigh ? 'text-red-700 font-bold' : 'text-gray-900'}`}>
            {current.value} {current.unit}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-700">Peak:</span>
          <span className={`font-mono font-bold ${peak.isHigh ? 'text-red-700' : 'text-orange-700'}`}>
            {peak.value} {peak.unit}
          </span>
        </div>

        <div className="flex justify-between pt-2 border-t border-red-300">
          <span className="text-gray-700">Increase:</span>
          <span className={`font-mono font-bold ${
            parseFloat(percentIncrease) > 50 ? 'text-red-700' : 'text-orange-700'
          }`}>
            +{percentIncrease}%
          </span>
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-red-300">
        <p className="text-xs text-red-700 italic">
          DELETE THIS COMPONENT AFTER TESTING
        </p>
      </div>
    </div>
  );
}
