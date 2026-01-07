import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CacheService, getCacheService } from './CacheService';

// Create mock adapter class factories
const createMockAdapter = () => ({
  init: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
  keys: vi.fn(),
  getAll: vi.fn(),
  getMany: vi.fn(),
});

// Mock instances that we can control in tests
let mockIndexedDBInstance = createMockAdapter();
let mockLocalStorageInstance = createMockAdapter();
let mockMemoryInstance = createMockAdapter();

// Mock the adapters with proper class constructors
vi.mock('./adapters/IndexedDBAdapter', () => ({
  IndexedDBAdapter: class {
    init = mockIndexedDBInstance.init;
    get = mockIndexedDBInstance.get;
    set = mockIndexedDBInstance.set;
    delete = mockIndexedDBInstance.delete;
    clear = mockIndexedDBInstance.clear;
    keys = mockIndexedDBInstance.keys;
    getAll = mockIndexedDBInstance.getAll;
    getMany = mockIndexedDBInstance.getMany;
  },
}));

vi.mock('./adapters/LocalStorageAdapter', () => ({
  LocalStorageAdapter: class {
    init = mockLocalStorageInstance.init;
    get = mockLocalStorageInstance.get;
    set = mockLocalStorageInstance.set;
    delete = mockLocalStorageInstance.delete;
    clear = mockLocalStorageInstance.clear;
    keys = mockLocalStorageInstance.keys;
    getAll = mockLocalStorageInstance.getAll;
    getMany = mockLocalStorageInstance.getMany;
  },
}));

vi.mock('./adapters/MemoryAdapter', () => ({
  MemoryAdapter: class {
    init = mockMemoryInstance.init;
    get = mockMemoryInstance.get;
    set = mockMemoryInstance.set;
    delete = mockMemoryInstance.delete;
    clear = mockMemoryInstance.clear;
    keys = mockMemoryInstance.keys;
    getAll = mockMemoryInstance.getAll;
    getMany = mockMemoryInstance.getMany;
  },
}));

describe('CacheService', () => {
  let cacheService: CacheService;

  beforeEach(() => {
    // Reset mock instances for each test
    mockIndexedDBInstance = createMockAdapter();
    mockLocalStorageInstance = createMockAdapter();
    mockMemoryInstance = createMockAdapter();

    // Set default memory behavior (always succeeds as fallback)
    mockMemoryInstance.init.mockResolvedValue(true);
    mockMemoryInstance.set.mockResolvedValue(true);
    mockMemoryInstance.clear.mockResolvedValue(true);

    vi.clearAllMocks();
    cacheService = new CacheService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('init', () => {
    it('uses IndexedDB when available', async () => {
      mockIndexedDBInstance.init.mockResolvedValue(true);

      const result = await cacheService.init();

      expect(result).toBe(true);
      expect(mockIndexedDBInstance.init).toHaveBeenCalled();
      expect(cacheService.getActiveStorageType()).toBe('IndexedDB');
    });

    it('falls back to localStorage when IndexedDB fails', async () => {
      mockIndexedDBInstance.init.mockResolvedValue(false);
      mockLocalStorageInstance.init.mockResolvedValue(true);

      const result = await cacheService.init();

      expect(result).toBe(true);
      expect(cacheService.getActiveStorageType()).toBe('localStorage');
    });

    it('falls back to memory when both IndexedDB and localStorage fail', async () => {
      mockIndexedDBInstance.init.mockResolvedValue(false);
      mockLocalStorageInstance.init.mockResolvedValue(false);
      mockMemoryInstance.init.mockResolvedValue(true);

      const result = await cacheService.init();

      expect(result).toBe(true);
      expect(cacheService.getActiveStorageType()).toBe('memory');
    });

    it('returns true if already initialized', async () => {
      mockIndexedDBInstance.init.mockResolvedValue(true);

      await cacheService.init();
      const result = await cacheService.init();

      expect(result).toBe(true);
      expect(mockIndexedDBInstance.init).toHaveBeenCalledTimes(1);
    });
  });

  describe('get', () => {
    beforeEach(async () => {
      mockIndexedDBInstance.init.mockResolvedValue(true);
      await cacheService.init();
    });

    it('retrieves value from active adapter', async () => {
      const testData = { name: 'test', value: 123 };
      mockIndexedDBInstance.get.mockResolvedValue(testData);

      const result = await cacheService.get('store', 'key');

      expect(result).toEqual(testData);
      expect(mockIndexedDBInstance.get).toHaveBeenCalledWith('store', 'key');
    });

    it('returns null when key not found', async () => {
      mockIndexedDBInstance.get.mockResolvedValue(null);

      const result = await cacheService.get('store', 'nonexistent');

      expect(result).toBeNull();
    });

    it('tries fallback adapters on error', async () => {
      mockIndexedDBInstance.get.mockRejectedValue(new Error('DB Error'));
      mockLocalStorageInstance.get.mockResolvedValue({ fallback: true });

      const result = await cacheService.get('store', 'key');

      expect(result).toEqual({ fallback: true });
    });
  });

  describe('set', () => {
    beforeEach(async () => {
      mockIndexedDBInstance.init.mockResolvedValue(true);
      await cacheService.init();
    });

    it('stores value in active adapter', async () => {
      mockIndexedDBInstance.set.mockResolvedValue(true);

      const result = await cacheService.set('store', 'key', { data: 'test' });

      expect(result).toBe(true);
      expect(mockIndexedDBInstance.set).toHaveBeenCalledWith('store', 'key', {
        data: 'test',
      });
    });

    it('tries fallback when primary fails', async () => {
      mockIndexedDBInstance.set.mockResolvedValue(false);
      mockLocalStorageInstance.set.mockResolvedValue(true);

      const result = await cacheService.set('store', 'key', 'value');

      expect(result).toBe(true);
      expect(mockLocalStorageInstance.set).toHaveBeenCalled();
    });

    it('falls back to memory when localStorage fails', async () => {
      mockIndexedDBInstance.set.mockResolvedValue(false);
      mockLocalStorageInstance.set.mockResolvedValue(false);
      mockMemoryInstance.set.mockResolvedValue(true);

      const result = await cacheService.set('store', 'key', 'value');

      expect(result).toBe(true);
      expect(mockMemoryInstance.set).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    beforeEach(async () => {
      mockIndexedDBInstance.init.mockResolvedValue(true);
      await cacheService.init();
    });

    it('deletes from active adapter', async () => {
      mockIndexedDBInstance.delete.mockResolvedValue(true);

      const result = await cacheService.delete('store', 'key');

      expect(result).toBe(true);
      expect(mockIndexedDBInstance.delete).toHaveBeenCalledWith('store', 'key');
    });

    it('returns false on error', async () => {
      mockIndexedDBInstance.delete.mockRejectedValue(new Error('Delete failed'));

      const result = await cacheService.delete('store', 'key');

      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    beforeEach(async () => {
      mockIndexedDBInstance.init.mockResolvedValue(true);
      await cacheService.init();
    });

    it('clears all adapters', async () => {
      mockIndexedDBInstance.clear.mockResolvedValue(true);
      mockLocalStorageInstance.clear.mockResolvedValue(true);
      mockMemoryInstance.clear.mockResolvedValue(true);

      const result = await cacheService.clear();

      expect(result).toBe(true);
      expect(mockIndexedDBInstance.clear).toHaveBeenCalledWith(null);
      expect(mockLocalStorageInstance.clear).toHaveBeenCalledWith(null);
      expect(mockMemoryInstance.clear).toHaveBeenCalledWith(null);
    });

    it('clears specific store', async () => {
      mockIndexedDBInstance.clear.mockResolvedValue(true);
      mockLocalStorageInstance.clear.mockResolvedValue(true);
      mockMemoryInstance.clear.mockResolvedValue(true);

      await cacheService.clear('tracks');

      expect(mockIndexedDBInstance.clear).toHaveBeenCalledWith('tracks');
    });
  });

  describe('keys', () => {
    beforeEach(async () => {
      mockIndexedDBInstance.init.mockResolvedValue(true);
      await cacheService.init();
    });

    it('returns keys from active adapter', async () => {
      mockIndexedDBInstance.keys.mockResolvedValue(['key1', 'key2', 'key3']);

      const result = await cacheService.keys('store');

      expect(result).toEqual(['key1', 'key2', 'key3']);
    });

    it('returns empty array on error', async () => {
      mockIndexedDBInstance.keys.mockRejectedValue(new Error('Keys error'));

      const result = await cacheService.keys('store');

      expect(result).toEqual([]);
    });
  });

  describe('getAll', () => {
    beforeEach(async () => {
      mockIndexedDBInstance.init.mockResolvedValue(true);
      await cacheService.init();
    });

    it('returns all values from active adapter', async () => {
      const values = [{ id: 1 }, { id: 2 }];
      mockIndexedDBInstance.getAll.mockResolvedValue(values);

      const result = await cacheService.getAll('store');

      expect(result).toEqual(values);
    });

    it('returns empty array on error', async () => {
      mockIndexedDBInstance.getAll.mockRejectedValue(new Error('GetAll error'));

      const result = await cacheService.getAll('store');

      expect(result).toEqual([]);
    });
  });

  describe('getMany', () => {
    beforeEach(async () => {
      mockIndexedDBInstance.init.mockResolvedValue(true);
      await cacheService.init();
    });

    it('returns map of values', async () => {
      const resultMap = new Map([
        ['key1', { data: 1 }],
        ['key2', { data: 2 }],
      ]);
      mockIndexedDBInstance.getMany.mockResolvedValue(resultMap);

      const result = await cacheService.getMany('store', ['key1', 'key2']);

      expect(result).toEqual(resultMap);
    });

    it('tries fallbacks on error', async () => {
      const fallbackMap = new Map([['key1', { fallback: true }]]);
      mockIndexedDBInstance.getMany.mockRejectedValue(new Error('GetMany error'));
      mockLocalStorageInstance.getMany.mockResolvedValue(fallbackMap);

      const result = await cacheService.getMany('store', ['key1']);

      expect(result).toEqual(fallbackMap);
    });
  });

  describe('isExpired', () => {
    it('returns true when cachedAt is undefined', () => {
      const cacheService = new CacheService();
      expect(cacheService.isExpired(undefined, 60000)).toBe(true);
    });

    it('returns true when TTL is 0', () => {
      const cacheService = new CacheService();
      expect(cacheService.isExpired(Date.now(), 0)).toBe(true);
    });

    it('returns true when cache is older than TTL', () => {
      const cacheService = new CacheService();
      const oldTime = Date.now() - 120000; // 2 minutes ago
      expect(cacheService.isExpired(oldTime, 60000)).toBe(true); // 1 minute TTL
    });

    it('returns false when cache is within TTL', () => {
      const cacheService = new CacheService();
      const recentTime = Date.now() - 30000; // 30 seconds ago
      expect(cacheService.isExpired(recentTime, 60000)).toBe(false); // 1 minute TTL
    });
  });

  describe('getActiveStorageType', () => {
    it('returns "none" when not initialized', () => {
      const cacheService = new CacheService();
      expect(cacheService.getActiveStorageType()).toBe('none');
    });
  });

  describe('getCacheService singleton', () => {
    it('returns same instance', () => {
      const instance1 = getCacheService();
      const instance2 = getCacheService();

      expect(instance1).toBe(instance2);
    });
  });

  describe('auto-initialization', () => {
    it('initializes automatically on first operation', async () => {
      mockIndexedDBInstance.init.mockResolvedValue(true);
      mockIndexedDBInstance.get.mockResolvedValue({ auto: true });

      // Don't call init() explicitly
      const result = await cacheService.get('store', 'key');

      expect(mockIndexedDBInstance.init).toHaveBeenCalled();
      expect(result).toEqual({ auto: true });
    });
  });
});
