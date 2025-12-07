type Options = {
    expires?: number | null | string;
};
type StoreData<T extends Serializable = Serializable> = {
    value: T;
    expires: number | null;
};
type Serializable = string | number | boolean | null | Serializable[] | {
    [key: string]: Serializable;
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
    EXPIRES?: false;
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

declare class Store {
    #private;
    PREFIX: string;
    promise: Promise<any> | null;
    client: Client;
    constructor(clientPromise: any);
    add<T extends Serializable>(value: T, options?: Options): Promise<string>;
    set<T extends Serializable>(key: string, value: T, options?: Options): Promise<string>;
    get<T extends Serializable = Serializable>(key: string): Promise<T | null>;
    has(key: string): Promise<boolean>;
    del(key: string): Promise<string>;
    [Symbol.asyncIterator]<T extends Serializable = Serializable>(): AsyncGenerator<[string, T], void, unknown>;
    entries<T extends Serializable = Serializable>(): Promise<[
        string,
        T
    ][]>;
    keys(): Promise<string[]>;
    values<T extends Serializable>(): Promise<T[]>;
    all<T extends Serializable>(): Promise<Record<string, T>>;
    clear(): Promise<void>;
    prefix(prefix?: string): Store;
    close(): Promise<void>;
}
declare const _default: (client?: any) => Store;

export { Store, _default as default };
