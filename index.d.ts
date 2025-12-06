type Options = {
    expires?: number | string | null;
    expire?: number | string | null;
};
type Value = any;
interface ClientInterface {
    EXPIRES?: boolean;
    promise?: Promise<any>;
    test?: (client: any) => boolean;
    get(key: string): Promise<Value | null> | Value | null;
    set(key: string, value: Value, options?: Options): Promise<any> | any;
    iterate(prefix: string): AsyncGenerator<[string, Value], void, unknown> | Generator<[string, Value], void, unknown>;
    add?(prefix: string, value: Value, options?: Options): Promise<string>;
    has?(key: string): Promise<boolean> | boolean;
    del?(key: string): Promise<any> | any;
    keys?(prefix: string): Promise<string[]> | string[];
    values?(prefix: string): Promise<Value[]> | Value[];
    entries?(prefix: string): Promise<[string, Value][]> | [string, Value][];
    all?(prefix: string): Promise<Record<string, Value>> | Record<string, Value>;
    clear?(prefix: string): Promise<any> | any;
    clearAll?(): Promise<any> | any;
    close?(): Promise<any> | any;
}
declare class Store {
    #private;
    PREFIX: string;
    promise: Promise<any> | null;
    client: ClientInterface;
    constructor(clientPromise: any);
    add(value: Value, options?: Options): Promise<string>;
    set(key: string, value: Value, options?: Options): Promise<string>;
    get(key: string): Promise<Value | null>;
    has(key: string): Promise<boolean>;
    del(key: string): Promise<string>;
    [Symbol.asyncIterator](): AsyncGenerator<[
        string,
        Value
    ], void, unknown>;
    entries(): Promise<[string, Value][]>;
    keys(): Promise<string[]>;
    values(): Promise<Value[]>;
    all(): Promise<Record<string, Value>>;
    clear(): Promise<void>;
    prefix(prefix?: string): Store;
    close(): Promise<void>;
}
declare const _default: (client?: any) => Store;

export { _default as default };
