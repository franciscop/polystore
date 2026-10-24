import type {
  AxiosStorage,
  CacheRequestConfig,
  NotEmptyStorageValue,
  StorageValue,
} from "axios-cache-interceptor";
import type { Store } from "polystore";
export declare class PolystoreAxiosCacheStorage implements AxiosStorage {
  "is-storage": number;
  private store;
  private _storage;
  constructor(store: Store);
  prefix(prefix?: string): PolystoreAxiosCacheStorage;
  get(key: string, currentRequest?: CacheRequestConfig): Promise<StorageValue>;
  set(
    key: string,
    value: NotEmptyStorageValue,
    currentRequest?: CacheRequestConfig,
  ): Promise<void>;
  remove(key: string, currentRequest?: CacheRequestConfig): Promise<void>;
  clear(): Promise<void>;
}
export default function axiosCacheStorage(
  store?: any,
): PolystoreAxiosCacheStorage;
