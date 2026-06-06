import { Store } from 'polystore';

type SecondaryStorage = {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
};
declare class PolystoreBetterAuthStorage implements SecondaryStorage {
    private store;
    constructor(store: Store);
    prefix(prefix?: string): PolystoreBetterAuthStorage;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
}
declare function betterAuthStorage(store?: any): PolystoreBetterAuthStorage;

export { PolystoreBetterAuthStorage, betterAuthStorage as default };
