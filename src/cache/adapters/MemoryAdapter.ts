/**
 * In-memory storage adapter
 * Last resort fallback - data is lost on page refresh
 * Always available, no feature detection needed
 */

export class MemoryAdapter {
  private _stores: Map<string, Map<string, unknown>>;

  constructor() {
    this._stores = new Map();
  }

  /**
   * Check if this adapter is available
   * Memory adapter is always available
   */
  isAvailable(): boolean {
    return true;
  }

  /**
   * Initialize the adapter (no-op for memory)
   */
  async init(): Promise<boolean> {
    return true;
  }

  /**
   * Get a value from the specified store
   */
  async get<T>(storeName: string, key: string): Promise<T | null> {
    const store = this._stores.get(storeName);
    if (!store) return null;
    return (store.get(key) as T) || null;
  }

  /**
   * Set a value in the specified store
   */
  async set<T>(storeName: string, key: string, value: T): Promise<boolean> {
    if (!this._stores.has(storeName)) {
      this._stores.set(storeName, new Map());
    }
    this._stores.get(storeName)!.set(key, value);
    return true;
  }

  /**
   * Delete a value from the specified store
   */
  async delete(storeName: string, key: string): Promise<boolean> {
    const store = this._stores.get(storeName);
    if (store) {
      store.delete(key);
    }
    return true;
  }

  /**
   * Clear all data in a store, or all stores if no storeName provided
   */
  async clear(storeName: string | null = null): Promise<boolean> {
    if (storeName) {
      this._stores.delete(storeName);
    } else {
      this._stores.clear();
    }
    return true;
  }

  /**
   * Get all keys in a store
   */
  async keys(storeName: string): Promise<string[]> {
    const store = this._stores.get(storeName);
    if (!store) return [];
    return Array.from(store.keys()) as string[];
  }

  /**
   * Get all values in a store
   */
  async getAll<T>(storeName: string): Promise<T[]> {
    const store = this._stores.get(storeName);
    if (!store) return [];
    return Array.from(store.values()) as T[];
  }

  /**
   * Get multiple values by keys
   */
  async getMany<T>(storeName: string, keys: string[]): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    const store = this._stores.get(storeName);

    if (!store) return results;

    for (const key of keys) {
      const value = store.get(key);
      if (value !== undefined) {
        results.set(key, value as T);
      }
    }

    return results;
  }
}
