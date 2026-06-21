import { buildStorage } from "axios-cache-interceptor";
import type {
  AxiosStorage,
  CacheRequestConfig,
  NotEmptyStorageValue,
  StorageValue,
} from "axios-cache-interceptor";
import kv from "polystore";
import type { Store } from "polystore";

// axios-cache-interceptor keeps expired entries around for a stale window so they
// can still be served stale or revalidated (ETag / Last-Modified) before being
// evicted. We mirror its built-in storages' default maxStaleAge so backends with
// native expiration (Redis, etc.) don't drop entries the interceptor still needs.
const MAX_STALE_AGE = 3_600_000; // 1 hour, matches buildMemoryStorage/buildWebStorage

const ttlFromValue = (value: NotEmptyStorageValue): { expires: number } | undefined => {
  // Loading entries (and anything without a ttl) are transient — let them be
  // replaced by the interceptor rather than expired out from under it.
  if (value.ttl === undefined || value.createdAt === undefined) return undefined;
  const staleTtl = value.state === "cached" ? value.staleTtl ?? 0 : 0;
  const removableAt =
    value.createdAt + value.ttl + Math.max(staleTtl, MAX_STALE_AGE);
  const secs = Math.ceil((removableAt - Date.now()) / 1000);
  return secs > 0 ? { expires: secs } : undefined;
};

export class PolystoreAxiosCacheStorage implements AxiosStorage {
  // Marks this object as a valid storage so `setupCache()` accepts it (it calls
  // the internal `isStorage()`, which checks for this exact property).
  "is-storage" = 1;
  private store: Store;
  private _storage: AxiosStorage;

  constructor(store: Store) {
    this.store = store;
    this._storage = buildStorage({
      find: (key) =>
        this.store.get<any>(key).then((v: StorageValue | null) => v ?? undefined),
      set: (key, value) =>
        this.store.set(key, value as any, ttlFromValue(value)) as Promise<any>,
      remove: (key) => this.store.del(key) as Promise<any>,
      clear: () => this.store.clear() as Promise<any>,
    });
  }

  prefix(prefix = ""): PolystoreAxiosCacheStorage {
    return new PolystoreAxiosCacheStorage(this.store.prefix(prefix));
  }

  get(key: string, currentRequest?: CacheRequestConfig): Promise<StorageValue> {
    return this._storage.get(key, currentRequest) as Promise<StorageValue>;
  }

  set(
    key: string,
    value: NotEmptyStorageValue,
    currentRequest?: CacheRequestConfig
  ): Promise<void> {
    return this._storage.set(key, value, currentRequest) as Promise<void>;
  }

  remove(key: string, currentRequest?: CacheRequestConfig): Promise<void> {
    return this._storage.remove(key, currentRequest) as Promise<void>;
  }

  clear(): Promise<void> {
    return Promise.resolve(this._storage.clear?.());
  }
}

export default function axiosCacheStorage(store: any = new Map()): PolystoreAxiosCacheStorage {
  return new PolystoreAxiosCacheStorage(kv(store));
}
