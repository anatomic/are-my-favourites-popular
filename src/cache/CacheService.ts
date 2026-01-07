/**
 * CacheService - Unified caching API with graceful degradation
 *
 * Attempts storage in order: IndexedDB -> localStorage -> Memory
 * Automatically falls back to the next tier if current fails
 */

import { IndexedDBAdapter } from './adapters/IndexedDBAdapter';
import { LocalStorageAdapter } from './adapters/LocalStorageAdapter';
import { MemoryAdapter } from './adapters/MemoryAdapter';

type StorageAdapter = IndexedDBAdapter | LocalStorageAdapter | MemoryAdapter;

export class CacheService {
  private _indexedDB: IndexedDBAdapter;
  private _localStorage: LocalStorageAdapter;
  private _memory: MemoryAdapter;
  private _activeAdapter: StorageAdapter | null;
  private _initialized: boolean;

  constructor() {
    this._indexedDB = new IndexedDBAdapter();
    this._localStorage = new LocalStorageAdapter();
    this._memory = new MemoryAdapter();

    this._activeAdapter = null;
    this._initialized = false;
  }

  /**
   * Initialize the cache service
   * Detects available storage and selects the best option
   */
  async init(): Promise<boolean> {
    if (this._initialized) {
      return true;
    }

    // Try IndexedDB first (largest capacity)
    if (await this._indexedDB.init()) {
      this._activeAdapter = this._indexedDB;
      this._initialized = true;
      return true;
    }

    // Fall back to localStorage
    if (await this._localStorage.init()) {
      this._activeAdapter = this._localStorage;
      this._initialized = true;
      return true;
    }

    // Last resort: memory (always available)
    await this._memory.init();
    this._activeAdapter = this._memory;
    this._initialized = true;
    return true;
  }

  /**
   * Ensure the service is initialized before operations
   */
  private async _ensureInit(): Promise<void> {
    if (!this._initialized) {
      await this.init();
    }
  }

  /**
   * Get the name of the currently active storage adapter
   * Useful for debugging
   */
  getActiveStorageType(): string {
    if (this._activeAdapter === this._indexedDB) return 'IndexedDB';
    if (this._activeAdapter === this._localStorage) return 'localStorage';
    if (this._activeAdapter === this._memory) return 'memory';
    return 'none';
  }

  /**
   * Get a value from cache
   */
  async get<T>(storeName: string, key: string): Promise<T | null> {
    await this._ensureInit();

    try {
      return await this._activeAdapter!.get<T>(storeName, key);
    } catch {
      console.warn('CacheService: Get failed, trying fallback');
      return this._tryFallbackGet<T>(storeName, key);
    }
  }

  /**
   * Set a value in cache
   * Includes automatic fallback if primary storage fails
   */
  async set<T>(storeName: string, key: string, value: T): Promise<boolean> {
    await this._ensureInit();

    try {
      const success = await this._activeAdapter!.set(storeName, key, value);
      if (success) return true;

      // Primary failed, try fallback
      return this._tryFallbackSet(storeName, key, value);
    } catch {
      console.warn('CacheService: Set failed, trying fallback');
      return this._tryFallbackSet(storeName, key, value);
    }
  }

  /**
   * Delete a value from cache
   */
  async delete(storeName: string, key: string): Promise<boolean> {
    await this._ensureInit();

    try {
      return await this._activeAdapter!.delete(storeName, key);
    } catch {
      return false;
    }
  }

  /**
   * Clear a store or all stores
   */
  async clear(storeName: string | null = null): Promise<boolean> {
    await this._ensureInit();

    try {
      // Clear from all adapters to ensure complete cleanup
      await Promise.all([
        this._indexedDB.clear(storeName).catch(() => {}),
        this._localStorage.clear(storeName).catch(() => {}),
        this._memory.clear(storeName)
      ]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all keys in a store
   */
  async keys(storeName: string): Promise<(string | IDBValidKey)[]> {
    await this._ensureInit();

    try {
      return await this._activeAdapter!.keys(storeName);
    } catch {
      return [];
    }
  }

  /**
   * Get all values in a store
   */
  async getAll<T>(storeName: string): Promise<T[]> {
    await this._ensureInit();

    try {
      return await this._activeAdapter!.getAll<T>(storeName);
    } catch {
      return [];
    }
  }

  /**
   * Check if a cached entry has expired
   */
  isExpired(cachedAt: number | undefined, ttl: number): boolean {
    if (!cachedAt || !ttl) return true;
    return Date.now() - cachedAt > ttl;
  }

  /**
   * Try fallback adapters for get operations
   */
  private async _tryFallbackGet<T>(storeName: string, key: string): Promise<T | null> {
    // Try localStorage if we're not already using it
    if (this._activeAdapter !== this._localStorage) {
      try {
        const result = await this._localStorage.get<T>(storeName, key);
        if (result) return result;
      } catch {
        // Continue to memory
      }
    }

    // Try memory as last resort
    if (this._activeAdapter !== this._memory) {
      try {
        return await this._memory.get<T>(storeName, key);
      } catch {
        // Nothing more to try
      }
    }

    return null;
  }

  /**
   * Try fallback adapters for set operations
   */
  private async _tryFallbackSet<T>(storeName: string, key: string, value: T): Promise<boolean> {
    // Try localStorage if we're not already using it
    if (this._activeAdapter !== this._localStorage) {
      try {
        const success = await this._localStorage.set(storeName, key, value);
        if (success) {
          // Switch to localStorage as active adapter
          this._activeAdapter = this._localStorage;
          return true;
        }
      } catch {
        // Continue to memory
      }
    }

    // Try memory as last resort
    if (this._activeAdapter !== this._memory) {
      try {
        const success = await this._memory.set(storeName, key, value);
        if (success) {
          // Switch to memory as active adapter
          this._activeAdapter = this._memory;
          return true;
        }
      } catch {
        // Nothing more to try
      }
    }

    return false;
  }
}

// Singleton instance
let cacheServiceInstance: CacheService | null = null;

/**
 * Get the singleton CacheService instance
 */
export function getCacheService(): CacheService {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new CacheService();
  }
  return cacheServiceInstance;
}
