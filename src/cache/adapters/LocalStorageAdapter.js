/**
 * localStorage storage adapter
 * Fallback when IndexedDB is unavailable
 * Synchronous operations with JSON serialization
 * Limited to ~5-10MB depending on browser
 */

import { CACHE_CONFIG } from '../constants.js';

export class LocalStorageAdapter {
  constructor() {
    this._prefix = CACHE_CONFIG.LOCALSTORAGE_PREFIX;
    this._maxSize = CACHE_CONFIG.MAX_LOCALSTORAGE_SIZE;
  }

  /**
   * Check if localStorage is available and working
   */
  isAvailable() {
    try {
      const testKey = '__storage_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Initialize the adapter
   */
  async init() {
    return this.isAvailable();
  }

  /**
   * Build a prefixed key for localStorage
   */
  _buildKey(storeName, key) {
    return `${this._prefix}${storeName}_${key}`;
  }

  /**
   * Get a value from localStorage
   */
  async get(storeName, key) {
    try {
      const fullKey = this._buildKey(storeName, key);
      const item = window.localStorage.getItem(fullKey);
      if (!item) return null;
      return JSON.parse(item);
    } catch (e) {
      // Corrupted data - remove it
      console.warn('LocalStorageAdapter: Failed to parse cached data, clearing entry');
      await this.delete(storeName, key);
      return null;
    }
  }

  /**
   * Set a value in localStorage
   */
  async set(storeName, key, value) {
    try {
      const fullKey = this._buildKey(storeName, key);
      const serialized = JSON.stringify(value);

      // Check if this would exceed our threshold
      if (serialized.length > this._maxSize) {
        console.warn('LocalStorageAdapter: Data too large for localStorage');
        return false;
      }

      window.localStorage.setItem(fullKey, serialized);
      return true;
    } catch (e) {
      // Likely quota exceeded
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.warn('LocalStorageAdapter: Quota exceeded');
      }
      return false;
    }
  }

  /**
   * Delete a value from localStorage
   */
  async delete(storeName, key) {
    try {
      const fullKey = this._buildKey(storeName, key);
      window.localStorage.removeItem(fullKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Clear all data for a store, or all cache data if no storeName provided
   */
  async clear(storeName = null) {
    try {
      const keysToRemove = [];
      const prefix = storeName
        ? `${this._prefix}${storeName}_`
        : this._prefix;

      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => window.localStorage.removeItem(key));
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get all keys in a store
   */
  async keys(storeName) {
    const result = [];
    const prefix = `${this._prefix}${storeName}_`;

    for (let i = 0; i < window.localStorage.length; i++) {
      const fullKey = window.localStorage.key(i);
      if (fullKey && fullKey.startsWith(prefix)) {
        // Extract the original key (remove prefix)
        result.push(fullKey.slice(prefix.length));
      }
    }

    return result;
  }

  /**
   * Get all values in a store
   */
  async getAll(storeName) {
    const keys = await this.keys(storeName);
    const values = [];

    for (const key of keys) {
      const value = await this.get(storeName, key);
      if (value !== null) {
        values.push(value);
      }
    }

    return values;
  }
}
