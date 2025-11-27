/**
 * PHASE 3: Pathfinding Worker Manager
 *
 * Manages communication with the pathfinding Web Worker.
 * Provides a clean Promise-based API for offloading pathfinding to background thread.
 */

import type { PathGraph, PathNode, Intersection } from '@/types';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

interface WorkerResponse {
  id: string;
  type: 'success' | 'error' | 'ready';
  result?: any;
  error?: string;
}

class PathfindingWorkerManager {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private requestIdCounter = 0;
  private isReady = false;
  private readyPromise: Promise<void>;
  private readyResolve?: () => void;

  constructor() {
    // Create promise that resolves when worker is ready
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });

    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      this.initWorker();
    }
  }

  private initWorker() {
    try {
      // Create worker from the worker file
      // Note: In Next.js, we need to use a URL to load the worker
      this.worker = new Worker(
        new URL('../workers/pathfinding.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const response = event.data;

        // Handle ready message
        if (response.type === 'ready') {
          this.isReady = true;
          this.readyResolve?.();
          console.log('🔧 Pathfinding worker initialized');
          return;
        }

        // Handle response for pending request
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(response.id);

          if (response.type === 'success') {
            pending.resolve(response.result);
          } else {
            pending.reject(new Error(response.error || 'Worker error'));
          }
        }
      };

      this.worker.onerror = (error) => {
        console.error('❌ Pathfinding worker error:', error);
        // Reject all pending requests
        this.pendingRequests.forEach(({ reject, timeout }) => {
          clearTimeout(timeout);
          reject(new Error('Worker crashed'));
        });
        this.pendingRequests.clear();
      };
    } catch (error) {
      console.error('❌ Failed to initialize pathfinding worker:', error);
      this.isReady = false;
    }
  }

  private async sendMessage<T>(
    type: string,
    data: any,
    timeoutMs: number = 10000
  ): Promise<T> {
    // Wait for worker to be ready
    await this.readyPromise;

    if (!this.worker || !this.isReady) {
      throw new Error('Worker not available');
    }

    const id = `req_${++this.requestIdCounter}`;

    return new Promise<T>((resolve, reject) => {
      // Set timeout for request
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Worker request timeout'));
      }, timeoutMs);

      // Store pending request
      this.pendingRequests.set(id, { resolve, reject, timeout });

      // Send message to worker
      this.worker!.postMessage({ type, id, ...data });
    });
  }

  /**
   * Find route using A* algorithm in worker thread
   */
  async findRoute(
    graph: PathGraph,
    start: Intersection,
    end: Intersection,
    startPlaceId?: string,
    endPlaceId?: string
  ): Promise<{
    route: PathNode[];
    algorithm: 'astar' | 'bfs' | 'failed';
    startPlaceId?: string;
    endPlaceId?: string;
  }> {
    return this.sendMessage('findRoute', {
      graph,
      start,
      end,
      startPlaceId,
      endPlaceId
    });
  }

  /**
   * Find nearest node in worker thread
   */
  async findNearestNode(
    graph: PathGraph,
    point: { x: number; y: number },
    maxDistance?: number
  ): Promise<PathNode | null> {
    return this.sendMessage('findNearestNode', {
      graph,
      point,
      maxDistance
    });
  }

  /**
   * Check if worker is available and ready
   */
  isAvailable(): boolean {
    return this.worker !== null && this.isReady;
  }

  /**
   * Terminate the worker
   */
  terminate() {
    if (this.worker) {
      // Clear all pending requests
      this.pendingRequests.forEach(({ reject, timeout }) => {
        clearTimeout(timeout);
        reject(new Error('Worker terminated'));
      });
      this.pendingRequests.clear();

      this.worker.terminate();
      this.worker = null;
      this.isReady = false;
      console.log('🛑 Pathfinding worker terminated');
    }
  }
}

// Singleton instance
let workerManagerInstance: PathfindingWorkerManager | null = null;

/**
 * Get the singleton worker manager instance
 */
export function getPathfindingWorkerManager(): PathfindingWorkerManager {
  if (!workerManagerInstance) {
    workerManagerInstance = new PathfindingWorkerManager();
  }
  return workerManagerInstance;
}

/**
 * Helper function to find route with automatic fallback to main thread
 */
export async function findRouteWithWorker(
  graph: PathGraph,
  start: Intersection,
  end: Intersection,
  startPlaceId?: string,
  endPlaceId?: string,
  useWorker: boolean = true
): Promise<{
  route: PathNode[];
  algorithm: 'astar' | 'bfs' | 'failed';
  usedWorker: boolean;
}> {
  const manager = getPathfindingWorkerManager();

  // Try worker if enabled and available
  if (useWorker && manager.isAvailable()) {
    try {
      const result = await manager.findRoute(graph, start, end, startPlaceId, endPlaceId);
      console.log(`⚡ Route found using worker (${result.algorithm}): ${result.route.length} nodes`);
      return {
        ...result,
        usedWorker: true
      };
    } catch (error) {
      console.warn('⚠️ Worker failed, falling back to main thread:', error);
      // Fall through to main thread fallback
    }
  }

  // Fallback to main thread
  const { findRouteWithDiagnostics } = await import('./pathfinding');
  const diagnostics = findRouteWithDiagnostics(graph, start, end, startPlaceId, endPlaceId);

  console.log(`🔧 Route found on main thread (${diagnostics.algorithm}): ${diagnostics.route.length} nodes`);

  return {
    route: diagnostics.route,
    algorithm: diagnostics.algorithm,
    usedWorker: false
  };
}
