/**
 * In-memory storage adapter
 * Last resort fallback - data is lost on page refresh
 * Always available, no feature detection needed
 */

export class MemoryAdapter {
  constructor() {
    this._stores = new Map();
  }

  /**
   * Check if this adapter is available
   * Memory adapter is always available
   */
  isAvailable() {
    return true;
  }

  /**
   * Initialize the adapter (no-op for memory)
   */
  async init() {
    return true;
  }

  /**
   * Get a value from the specified store
   */
  async get(storeName, key) {
    const store = this._stores.get(storeName);
    if (!store) return null;
    return store.get(key) || null;
  }

  /**
   * Set a value in the specified store
   */
  async set(storeName, key, value) {
    if (!this._stores.has(storeName)) {
      this._stores.set(storeName, new Map());
    }
    this._stores.get(storeName).set(key, value);
    return true;
  }

  /**
   * Delete a value from the specified store
   */
  async delete(storeName, key) {
    const store = this._stores.get(storeName);
    if (store) {
      store.delete(key);
    }
    return true;
  }

  /**
   * Clear all data in a store, or all stores if no storeName provided
   */
  async clear(storeName = null) {
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
  async keys(storeName) {
    const store = this._stores.get(storeName);
    if (!store) return [];
    return Array.from(store.keys());
  }

  /**
   * Get all values in a store
   */
  async getAll(storeName) {
    const store = this._stores.get(storeName);
    if (!store) return [];
    return Array.from(store.values());
  }
}
