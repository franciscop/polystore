type Options = {
    expires?: number | null | string;
};
type StoreData<T extends Serializable = Serializable> = {
    value: T;
    expires: number | null;
};
type Serializable = string | number | boolean | null | (Serializable | null)[] | {
    [key: string]: Serializable | null;
};
interface ClientExpires {
    EXPIRES: true;
    promise?: Promise<any>;
    test?: (client: any) => boolean;
    get<T extends Serializable>(key: string): Promise<T | null> | T | null;
    set<T extends Serializable>(key: string, value: T, options?: Options): Promise<any> | any;
    iterate<T extends Serializable>(prefix: string): AsyncGenerator<[string, T], void, unknown> | Generator<[string, T], void, unknown>;
    add?<T extends Serializable>(prefix: string, value: T, options?: Options): Promise<string>;
    has?(key: string): Promise<boolean> | boolean;
    del?(key: string): Promise<any> | any;
    keys?(prefix: string): Promise<string[]> | string[];
    values?<T extends Serializable>(prefix: string): Promise<T[]> | T[];
    entries?<T extends Serializable>(prefix: string): Promise<[string, T][]> | [string, T][];
    all?<T extends Serializable>(prefix: string): Promise<Record<string, T>> | Record<string, T>;
    clear?(prefix: string): Promise<any> | any;
    clearAll?(): Promise<any> | any;
    close?(): Promise<any> | any;
}
interface ClientNonExpires {
    EXPIRES: false;
    promise?: Promise<any>;
    test?: (client: any) => boolean;
    get<T extends Serializable>(key: string): Promise<StoreData<T> | null> | StoreData<T> | null;
    set<T extends Serializable>(key: string, value: StoreData<T> | null, options?: Options): Promise<any> | any;
    iterate<T extends Serializable>(prefix: string): AsyncGenerator<[string, StoreData<T>], void, unknown> | Generator<[string, StoreData<T>], void, unknown>;
    add?<T extends Serializable>(prefix: string, value: StoreData<T>, options?: Options): Promise<string>;
    has?(key: string): Promise<boolean> | boolean;
    del?(key: string): Promise<any> | any;
    keys?(prefix: string): Promise<string[]> | string[];
    values?<T extends Serializable>(prefix: string): Promise<StoreData<T>[]> | StoreData<T>[];
    entries?<T extends Serializable>(prefix: string): Promise<[string, StoreData<T>][]> | [string, StoreData<T>][];
    all?<T extends Serializable>(prefix: string): Promise<Record<string, StoreData<T>>> | Record<string, StoreData<T>>;
    clear?(prefix: string): Promise<any> | any;
    clearAll?(): Promise<any> | any;
    close?(): Promise<any> | any;
}
type Client = ClientExpires | ClientNonExpires;

declare class Store<TDefault extends Serializable = Serializable> {
    #private;
    PREFIX: string;
    promise: Promise<Client> | null;
    client: Client;
    constructor(clientPromise?: any);
    add(value: TDefault, options?: Options): Promise<string>;
    add<T extends TDefault>(value: T, options?: Options): Promise<string>;
    set(key: string, value: TDefault, options?: Options): Promise<string>;
    set<T extends TDefault>(key: string, value: T, options?: Options): Promise<string>;
    get(key: string): Promise<TDefault | null>;
    get<T extends TDefault>(key: string): Promise<T | null>;
    has(key: string): Promise<boolean>;
    del(key: string): Promise<string>;
    [Symbol.asyncIterator](): AsyncGenerator<[string, TDefault], void, unknown>;
    [Symbol.asyncIterator]<T extends TDefault>(): AsyncGenerator<[
        string,
        T
    ], void, unknown>;
    entries(): Promise<[string, TDefault][]>;
    entries<T extends TDefault>(): Promise<[string, T][]>;
    keys(): Promise<string[]>;
    values(): Promise<TDefault[]>;
    values<T extends TDefault>(): Promise<T[]>;
    all(): Promise<Record<string, TDefault>>;
    all<T extends TDefault>(): Promise<Record<string, T>>;
    clear(): Promise<void>;
    prefix(prefix?: string): Store<TDefault>;
    close(): Promise<void>;
}
declare function createStore(): Store<Serializable>;
declare function createStore<T extends Serializable = Serializable>(client?: any): Store<T>;

export { type Client, type Serializable, Store, createStore as default };
