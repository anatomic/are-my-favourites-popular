/**
 * IndexedDB storage adapter
 * Primary storage for large datasets
 * Async operations, supports 250MB+ storage
 */

import { CACHE_CONFIG } from '../constants';

export class IndexedDBAdapter {
  private _dbName: string;
  private _dbVersion: number;
  private _db: IDBDatabase | null;
  private _stores: string[];

  constructor() {
    this._dbName = CACHE_CONFIG.INDEXEDDB_NAME;
    this._dbVersion = CACHE_CONFIG.INDEXEDDB_VERSION;
    this._db = null;
    this._stores = Object.values(CACHE_CONFIG.STORES);
  }

  /**
   * Check if IndexedDB is available
   */
  isAvailable(): boolean {
    try {
      return 'indexedDB' in window && window.indexedDB !== null;
    } catch {
      return false;
    }
  }

  /**
   * Initialize and open the database
   */
  async init(): Promise<boolean> {
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

        request.onsuccess = () => {
          this._db = request.result;

          // Handle connection closing unexpectedly
          this._db.onclose = () => {
            this._db = null;
          };

          resolve(true);
        };

        request.onupgradeneeded = () => {
          const db = request.result;

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
  private async _ensureDb(): Promise<IDBDatabase> {
    if (!this._db) {
      const initialized = await this.init();
      if (!initialized) {
        throw new Error('IndexedDB not available');
      }
    }
    return this._db!;
  }

  /**
   * Get a value from the database
   */
  async get<T>(storeName: string, key: string): Promise<T | null> {
    try {
      const db = await this._ensureDb();

      return new Promise((resolve) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => {
          resolve((request.result as T) || null);
        };

        request.onerror = () => {
          console.warn('IndexedDBAdapter: Failed to get item');
          resolve(null);
        };
      });
    } catch {
      return null;
    }
  }

  /**
   * Set a value in the database
   */
  async set<T>(storeName: string, key: string, value: T): Promise<boolean> {
    try {
      const db = await this._ensureDb();

      // Ensure the value has an id field for the keyPath
      const record = { ...(value as object), id: key };

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
    } catch {
      return false;
    }
  }

  /**
   * Delete a value from the database
   */
  async delete(storeName: string, key: string): Promise<boolean> {
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
    } catch {
      return false;
    }
  }

  /**
   * Clear all data in a store, or all stores if no storeName provided
   */
  async clear(storeName: string | null = null): Promise<boolean> {
    try {
      const db = await this._ensureDb();
      const storesToClear = storeName ? [storeName] : this._stores;

      for (const store of storesToClear) {
        await new Promise<boolean>((resolve) => {
          const transaction = db.transaction(store, 'readwrite');
          const objectStore = transaction.objectStore(store);
          const request = objectStore.clear();

          request.onsuccess = () => resolve(true);
          request.onerror = () => resolve(false);
        });
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all keys in a store
   */
  async keys(storeName: string): Promise<IDBValidKey[]> {
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
    } catch {
      return [];
    }
  }

  /**
   * Get all values in a store
   */
  async getAll<T>(storeName: string): Promise<T[]> {
    try {
      const db = await this._ensureDb();

      return new Promise((resolve) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => {
          resolve((request.result as T[]) || []);
        };

        request.onerror = () => {
          resolve([]);
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Get multiple values by keys in a single transaction
   * Much faster than multiple individual get() calls
   */
  async getMany<T>(storeName: string, keys: string[]): Promise<Map<string, T>> {
    const results = new Map<string, T>();

    if (keys.length === 0) {
      return results;
    }

    try {
      const db = await this._ensureDb();

      return new Promise((resolve) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);

        // Collect results from individual requests
        for (const key of keys) {
          const request = store.get(key);

          request.onsuccess = () => {
            if (request.result) {
              results.set(key, request.result as T);
            }
          };

          // Errors on individual requests don't abort transaction
          // We just won't have that key in results
        }

        // Wait for the entire transaction to complete before resolving
        // This ensures all data is committed and consistent
        transaction.oncomplete = () => {
          resolve(results);
        };

        transaction.onerror = () => {
          console.warn('IndexedDBAdapter: getMany transaction failed');
          resolve(results);
        };

        transaction.onabort = () => {
          console.warn('IndexedDBAdapter: getMany transaction aborted');
          resolve(results);
        };
      });
    } catch {
      return results;
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }
}
