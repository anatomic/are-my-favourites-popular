/**
 * CacheService - Unified caching API with graceful degradation
 *
 * Attempts storage in order: IndexedDB -> localStorage -> Memory
 * Automatically falls back to the next tier if current fails
 */

import { IndexedDBAdapter } from './adapters/IndexedDBAdapter.js';
import { LocalStorageAdapter } from './adapters/LocalStorageAdapter.js';
import { MemoryAdapter } from './adapters/MemoryAdapter.js';

export class CacheService {
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
  async init() {
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
  async _ensureInit() {
    if (!this._initialized) {
      await this.init();
    }
  }

  /**
   * Get the name of the currently active storage adapter
   * Useful for debugging
   */
  getActiveStorageType() {
    if (this._activeAdapter === this._indexedDB) return 'IndexedDB';
    if (this._activeAdapter === this._localStorage) return 'localStorage';
    if (this._activeAdapter === this._memory) return 'memory';
    return 'none';
  }

  /**
   * Get a value from cache
   */
  async get(storeName, key) {
    await this._ensureInit();

    try {
      return await this._activeAdapter.get(storeName, key);
    } catch (e) {
      console.warn('CacheService: Get failed, trying fallback');
      return this._tryFallbackGet(storeName, key);
    }
  }

  /**
   * Set a value in cache
   * Includes automatic fallback if primary storage fails
   */
  async set(storeName, key, value) {
    await this._ensureInit();

    try {
      const success = await this._activeAdapter.set(storeName, key, value);
      if (success) return true;

      // Primary failed, try fallback
      return this._tryFallbackSet(storeName, key, value);
    } catch (e) {
      console.warn('CacheService: Set failed, trying fallback');
      return this._tryFallbackSet(storeName, key, value);
    }
  }

  /**
   * Delete a value from cache
   */
  async delete(storeName, key) {
    await this._ensureInit();

    try {
      return await this._activeAdapter.delete(storeName, key);
    } catch (e) {
      return false;
    }
  }

  /**
   * Clear a store or all stores
   */
  async clear(storeName = null) {
    await this._ensureInit();

    try {
      // Clear from all adapters to ensure complete cleanup
      await Promise.all([
        this._indexedDB.clear(storeName).catch(() => {}),
        this._localStorage.clear(storeName).catch(() => {}),
        this._memory.clear(storeName)
      ]);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get all keys in a store
   */
  async keys(storeName) {
    await this._ensureInit();

    try {
      return await this._activeAdapter.keys(storeName);
    } catch (e) {
      return [];
    }
  }

  /**
   * Get all values in a store
   */
  async getAll(storeName) {
    await this._ensureInit();

    try {
      return await this._activeAdapter.getAll(storeName);
    } catch (e) {
      return [];
    }
  }

  /**
   * Check if a cached entry has expired
   */
  isExpired(cachedAt, ttl) {
    if (!cachedAt || !ttl) return true;
    return Date.now() - cachedAt > ttl;
  }

  /**
   * Try fallback adapters for get operations
   */
  async _tryFallbackGet(storeName, key) {
    // Try localStorage if we're not already using it
    if (this._activeAdapter !== this._localStorage) {
      try {
        const result = await this._localStorage.get(storeName, key);
        if (result) return result;
      } catch (e) {
        // Continue to memory
      }
    }

    // Try memory as last resort
    if (this._activeAdapter !== this._memory) {
      try {
        return await this._memory.get(storeName, key);
      } catch (e) {
        // Nothing more to try
      }
    }

    return null;
  }

  /**
   * Try fallback adapters for set operations
   */
  async _tryFallbackSet(storeName, key, value) {
    // Try localStorage if we're not already using it
    if (this._activeAdapter !== this._localStorage) {
      try {
        const success = await this._localStorage.set(storeName, key, value);
        if (success) {
          // Switch to localStorage as active adapter
          this._activeAdapter = this._localStorage;
          return true;
        }
      } catch (e) {
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
      } catch (e) {
        // Nothing more to try
      }
    }

    return false;
  }
}

// Singleton instance
let cacheServiceInstance = null;

/**
 * Get the singleton CacheService instance
 */
export function getCacheService() {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new CacheService();
  }
  return cacheServiceInstance;
}
