/**
 * localStorage storage adapter
 * Fallback when IndexedDB is unavailable
 * Synchronous operations with JSON serialization
 * Limited to ~5-10MB depending on browser
 */

import { CACHE_CONFIG } from '../constants';
import { loggers } from '../../utils/logger';

const log = loggers.cache;

interface StorageError extends Error {
  name: string;
  code?: number;
}

export class LocalStorageAdapter {
  private _prefix: string;
  private _maxSize: number;

  constructor() {
    this._prefix = CACHE_CONFIG.LOCALSTORAGE_PREFIX;
    this._maxSize = CACHE_CONFIG.MAX_LOCALSTORAGE_SIZE;
  }

  /**
   * Check if localStorage is available and working
   */
  isAvailable(): boolean {
    try {
      const testKey = '__storage_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize the adapter
   */
  async init(): Promise<boolean> {
    return this.isAvailable();
  }

  /**
   * Build a prefixed key for localStorage
   */
  private _buildKey(storeName: string, key: string): string {
    return `${this._prefix}${storeName}_${key}`;
  }

  /**
   * Get a value from localStorage
   */
  async get<T>(storeName: string, key: string): Promise<T | null> {
    try {
      const fullKey = this._buildKey(storeName, key);
      const item = window.localStorage.getItem(fullKey);
      if (!item) return null;
      return JSON.parse(item) as T;
    } catch {
      // Corrupted data - remove it
      log.warn('LocalStorageAdapter: Failed to parse cached data, clearing entry');
      await this.delete(storeName, key);
      return null;
    }
  }

  /**
   * Set a value in localStorage
   */
  async set<T>(storeName: string, key: string, value: T): Promise<boolean> {
    try {
      const fullKey = this._buildKey(storeName, key);
      const serialized = JSON.stringify(value);

      // Check if this would exceed our threshold
      if (serialized.length > this._maxSize) {
        log.warn('LocalStorageAdapter: Data too large for localStorage');
        return false;
      }

      window.localStorage.setItem(fullKey, serialized);
      return true;
    } catch (e) {
      // Likely quota exceeded
      const error = e as StorageError;
      if (error.name === 'QuotaExceededError' || error.code === 22) {
        log.warn('LocalStorageAdapter: Quota exceeded');
      }
      return false;
    }
  }

  /**
   * Delete a value from localStorage
   */
  async delete(storeName: string, key: string): Promise<boolean> {
    try {
      const fullKey = this._buildKey(storeName, key);
      window.localStorage.removeItem(fullKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear all data for a store, or all cache data if no storeName provided
   */
  async clear(storeName: string | null = null): Promise<boolean> {
    try {
      const keysToRemove: string[] = [];
      const prefix = storeName ? `${this._prefix}${storeName}_` : this._prefix;

      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach((key) => window.localStorage.removeItem(key));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all keys in a store
   */
  async keys(storeName: string): Promise<string[]> {
    const result: string[] = [];
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
  async getAll<T>(storeName: string): Promise<T[]> {
    const keys = await this.keys(storeName);
    const values: T[] = [];

    for (const key of keys) {
      const value = await this.get<T>(storeName, key);
      if (value !== null) {
        values.push(value);
      }
    }

    return values;
  }

  /**
   * Get multiple values by keys
   */
  async getMany<T>(storeName: string, keys: string[]): Promise<Map<string, T>> {
    const results = new Map<string, T>();

    for (const key of keys) {
      const value = await this.get<T>(storeName, key);
      if (value !== null) {
        results.set(key, value);
      }
    }

    return results;
  }
}
