import { Store } from 'polystore';
import { AxiosStorage, CacheRequestConfig, StorageValue, NotEmptyStorageValue } from 'axios-cache-interceptor';

declare class PolystoreAxiosCacheStorage implements AxiosStorage {
    "is-storage": number;
    private store;
    private _storage;
    constructor(store: Store);
    prefix(prefix?: string): PolystoreAxiosCacheStorage;
    get(key: string, currentRequest?: CacheRequestConfig): Promise<StorageValue>;
    set(key: string, value: NotEmptyStorageValue, currentRequest?: CacheRequestConfig): Promise<void>;
    remove(key: string, currentRequest?: CacheRequestConfig): Promise<void>;
    clear(): Promise<void>;
}
declare function axiosCacheStorage(store?: any): PolystoreAxiosCacheStorage;

export { PolystoreAxiosCacheStorage, axiosCacheStorage as default };
