/**
 * IndexedDB storage adapter
 * Primary storage for large datasets
 * Async operations, supports 250MB+ storage
 */

import { CACHE_CONFIG } from '../constants.js';

export class IndexedDBAdapter {
  constructor() {
    this._dbName = CACHE_CONFIG.INDEXEDDB_NAME;
    this._dbVersion = CACHE_CONFIG.INDEXEDDB_VERSION;
    this._db = null;
    this._stores = Object.values(CACHE_CONFIG.STORES);
  }

  /**
   * Check if IndexedDB is available
   */
  isAvailable() {
    try {
      return 'indexedDB' in window && window.indexedDB !== null;
    } catch (e) {
      return false;
    }
  }

  /**
   * Initialize and open the database
   */
  async init() {
    if (!this.isAvailable()) {
      return false;
    }

    if (this._db) {
      return true;
    }

    return new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(this._dbName, this._dbVersion);

        request.onerror = () => {
          console.warn('IndexedDBAdapter: Failed to open database');
          resolve(false);
        };

        request.onsuccess = (event) => {
          this._db = event.target.result;

          // Handle connection closing unexpectedly
          this._db.onclose = () => {
            this._db = null;
          };

          resolve(true);
        };

        request.onupgradeneeded = (event) => {
          const db = event.target.result;

          // Create object stores for each cache type
          for (const storeName of this._stores) {
            if (!db.objectStoreNames.contains(storeName)) {
              db.createObjectStore(storeName, { keyPath: 'id' });
            }
          }
        };

        request.onblocked = () => {
          console.warn('IndexedDBAdapter: Database blocked');
          resolve(false);
        };
      } catch (e) {
        console.warn('IndexedDBAdapter: Exception during init', e);
        resolve(false);
      }
    });
  }

  /**
   * Ensure database is ready before operations
   */
  async _ensureDb() {
    if (!this._db) {
      const initialized = await this.init();
      if (!initialized) {
        throw new Error('IndexedDB not available');
      }
    }
    return this._db;
  }

  /**
   * Get a value from the database
   */
  async get(storeName, key) {
    try {
      const db = await this._ensureDb();

      return new Promise((resolve) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => {
          resolve(request.result || null);
        };

        request.onerror = () => {
          console.warn('IndexedDBAdapter: Failed to get item');
          resolve(null);
        };
      });
    } catch (e) {
      return null;
    }
  }

  /**
   * Set a value in the database
   */
  async set(storeName, key, value) {
    try {
      const db = await this._ensureDb();

      // Ensure the value has an id field for the keyPath
      const record = { ...value, id: key };

      return new Promise((resolve) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(record);

        request.onsuccess = () => {
          resolve(true);
        };

        request.onerror = () => {
          console.warn('IndexedDBAdapter: Failed to set item');
          resolve(false);
        };
      });
    } catch (e) {
      return false;
    }
  }

  /**
   * Delete a value from the database
   */
  async delete(storeName, key) {
    try {
      const db = await this._ensureDb();

      return new Promise((resolve) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => {
          resolve(true);
        };

        request.onerror = () => {
          resolve(false);
        };
      });
    } catch (e) {
      return false;
    }
  }

  /**
   * Clear all data in a store, or all stores if no storeName provided
   */
  async clear(storeName = null) {
    try {
      const db = await this._ensureDb();
      const storesToClear = storeName ? [storeName] : this._stores;

      for (const store of storesToClear) {
        await new Promise((resolve) => {
          const transaction = db.transaction(store, 'readwrite');
          const objectStore = transaction.objectStore(store);
          const request = objectStore.clear();

          request.onsuccess = () => resolve(true);
          request.onerror = () => resolve(false);
        });
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get all keys in a store
   */
  async keys(storeName) {
    try {
      const db = await this._ensureDb();

      return new Promise((resolve) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAllKeys();

        request.onsuccess = () => {
          resolve(request.result || []);
        };

        request.onerror = () => {
          resolve([]);
        };
      });
    } catch (e) {
      return [];
    }
  }

  /**
   * Get all values in a store
   */
  async getAll(storeName) {
    try {
      const db = await this._ensureDb();

      return new Promise((resolve) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => {
          resolve(request.result || []);
        };

        request.onerror = () => {
          resolve([]);
        };
      });
    } catch (e) {
      return [];
    }
  }

  /**
   * Close the database connection
   */
  close() {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }
}
