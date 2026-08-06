import AdapterBase from "./adapters/Adapter";
import adapters from "./adapters/index";
import type {
  Adapter,
  Expires,
  Options,
  Prefix,
  Serializable,
  StoreData,
  StoreType,
} from "./types";
import { createId, parse, unix } from "./utils";

// adapter.connect() runs once per adapter; kept here (instead of on the
// adapter) so that a frozen or shared adapter is never written to
const inits = new WeakMap<object, Promise<any>>();

class Store<TD extends Serializable = Serializable> {
  PREFIX: Prefix = "";
  EXPIRES: Expires = null;
  #promise: Promise<void> | null;
  #adapter!: Adapter;
  type: StoreType = "UNKNOWN";

  constructor(
    adapterInput: any = new Map(),
    options: Options = {
      prefix: "",
      expires: null,
    },
  ) {
    this.PREFIX = options.prefix || "";
    this.EXPIRES = parse(options.expires || null);

    // Warn on what the user passed, before it gets unwrapped below
    if (adapterInput && typeof adapterInput.then === "function") {
      console.warn("kv(): pass the client, not a promise; it connects itself");
    }

    const input = this.#unwrap(adapterInput);

    // A promise hides the client until it resolves, so the type waits too
    if (input && typeof input.then === "function") {
      this.type = "PROMISE";
      this.#promise = input.then(async (raw: any) => {
        await this.#adopt(await this.#unwrap(raw));
        this.#promise = null;
      });
    } else {
      const init = this.#adopt(input);
      this.#promise = init?.then(() => {
        this.#promise = null;
      }) ?? null;
    }

    // A failed init (e.g. an unreachable Redis) should reject on the first
    // operation, not as an unhandled rejection for a store nobody used
    this.#promise?.catch(() => {});
  }

  // A store passed to kv() keeps its config (prefixes stack the same way
  // chained .prefix() calls do) and hands over its adapter, or a promise of
  // it when that store is itself still resolving
  #unwrap(raw: any): any {
    if (!(raw instanceof Store)) return raw;
    this.PREFIX = raw.PREFIX + this.PREFIX;
    this.EXPIRES = this.EXPIRES ?? raw.EXPIRES;
    return raw.#adapter ?? raw.#promise!.then(() => raw.#adapter);
  }

  // Resolve the adapter and start its setup (importing fs, creating a table,
  // connecting a client). It runs once per adapter, so substores share it
  #adopt(raw: any): Promise<any> | undefined {
    this.#adapter = this.#find(raw);
    this.#validate(this.#adapter);
    this.type = this.#adapter.TYPE || "UNKNOWN";

    let init = this.#adapter.promise;
    if (!init && this.#adapter.connect) {
      init = inits.get(this.#adapter);
      if (!init) inits.set(this.#adapter, (init = this.#adapter.connect()));
    }
    return init;
  }

  #find(store: any): Adapter {
    // Already a fully compliant KV store
    if (store instanceof Store) return store.#adapter;

    // Already a wrapped adapter (e.g. from a substore)
    if (store instanceof AdapterBase) return store as unknown as Adapter;

    // One of the supported ones, so we receive an instance and
    // wrap it with the adapter wrapper
    for (let A of Object.values(adapters)) {
      if ("test" in A && A.test(store)) {
        // Some TS BS
        return new A(store) as Adapter;
      }
      if ("testKeys" in A && typeof store === "object") {
        if (A.testKeys.every((key) => store[key])) {
          return new A(store) as Adapter;
        }
      }
    }

    // We get passed a class
    if (
      typeof store === "function" &&
      /^class\s/.test(Function.prototype.toString.call(store))
    ) {
      return new store();
    }

    // A raw one, we just receive the single instance to use directly
    return store;
  }

  #validate(adapter: Adapter): void {
    if (!adapter) throw new Error("No adapter received");
    if (!adapter.set || !adapter.get) {
      throw new Error("Adapter should have .get() and .set()");
    }

    // No need to validate the methods
    if (adapter.HAS_EXPIRATION) return;

    for (let method of ["has", "keys", "values"]) {
      if ((adapter as any)[method]) {
        throw new Error(`adapter.${method}() requires HAS_EXPIRATION`);
      }
    }
  }

  // Check if the given data is fresh or not
  #isFresh(data: any): data is StoreData {
    // Should never happen, but COULD happen; treat it as stale
    if (!data || typeof data !== "object" || !("value" in data)) {
      return false;
    }

    // It never expires, or it's fresh
    return data.expires === null || data.expires > Date.now();
  }

  // Adapters can skip .iterate() (some backends cannot list their keys),
  // giving up the group methods but keeping all of the single-key ones
  #assertIterate(): void {
    if (this.#adapter.iterate) return;
    throw new Error(`${this.type} does not support .iterate()`);
  }

  // Normalize returns the instance's `prefix` and `expires`
  #expiration(expires?: Expires) {
    // When the options.expires = null, it means we don't want it to expire
    return parse(expires !== undefined ? expires : this.EXPIRES);
  }

  /**
   * Save the data on an autogenerated key, can add expiration as well:
   *
   * ```js
   * const key1 = await store.add("value1");
   * const key2 = await store.add({ hello: "world" });
   * const key3 = await store.add("value3", { expires: "1h" });
   * ```
   *
   * **[→ Full .add() Docs](https://polystore.dev/documentation#add)**
   */
  add(value: TD, options?: Options): Promise<string>;
  add<T extends TD>(value: T, options?: Options): Promise<string>;
  async add<T extends TD = TD>(value: T, options: Options): Promise<string> {
    await this.#promise;
    const expires = this.#expiration(options?.expires);
    const prefix = options?.prefix || this.PREFIX;

    // Use the underlying one from the adapter if found
    if (this.#adapter.add) {
      if (this.#adapter.HAS_EXPIRATION) {
        return this.#adapter.add(prefix, value, expires);
      }

      // In the data we need the timestamp since we need it "absolute":
      return this.#adapter.add(prefix, { expires: unix(expires), value });
    }

    return this.set(createId(), value, { prefix, expires });
  }

  /**
   * Save the data on the given key, can add expiration as well:
   *
   * ```js
   * const key = await store.set("key1", "value1");
   * await store.set("key2", { hello: "world" });
   * await store.set("key3", "value3", { expires: "1h" });
   * ```
   *
   * **[→ Full .set() Docs](https://polystore.dev/documentation#set)**
   */
  set(key: string, value: TD, options?: Options): Promise<string>;
  set<T extends TD>(key: string, value: T, options?: Options): Promise<string>;
  async set<T extends Serializable = TD>(
    key: string,
    value: T,
    options: Options,
  ): Promise<string> {
    await this.#promise;
    const expires = this.#expiration(options?.expires);
    const prefix = options?.prefix || this.PREFIX;
    const id = prefix + key;

    // Quick delete
    if (value === null || (typeof expires === "number" && expires <= 0)) {
      return this.del(key);
    }

    // The adapter manages the expiration, so let it manage it
    if (this.#adapter.HAS_EXPIRATION) {
      await this.#adapter.set<T>(id, value, expires);
      return key;
    }

    // In the data we need the timestamp since we need it "absolute":
    await this.#adapter.set<T>(id, { expires: unix(expires), value });
    return key;
  }

  /**
   * Read a single value from the KV store:
   *
   * ```js
   * const value1 = await store.get("key1");
   * // null (doesn't exist or has expired)
   * const value2 = await store.get("key2");
   * // "value2"
   * const value3 = await store.get("key3");
   * // { hello: "world" }
   * ```
   *
   * **[→ Full .get() Docs](https://polystore.dev/documentation#get)**
   */
  get(key: string): Promise<TD | null>;
  get<T extends TD>(key: string): Promise<T | null>;
  async get<T extends TD = TD>(key: string): Promise<T | null> {
    await this.#promise;
    const id = this.PREFIX + key;

    // The adapter already managed expiration and there's STILL some data,
    // so we can assume it's the raw user data
    if (this.#adapter.HAS_EXPIRATION) {
      const data = (await this.#adapter.get<T>(id)) ?? null;

      // No value; nothing to do/check
      if (data === null) return null;

      return data;
    } else {
      const data = (await this.#adapter.get<T>(id)) ?? null;

      // No value; nothing to do/check
      if (data === null) return null;

      if (!this.#isFresh(data)) return null;
      return data.value;
    }
  }

  /**
   * Check whether a key exists or not:
   *
   * ```js
   * if (await store.has("key1")) { ... }
   * ```
   *
   * If you are going to use the value, it's better to just read it:
   *
   * ```js
   * const val = await store.get("key1");
   * if (val) { ... }
   * ```
   *
   * **[→ Full .has() Docs](https://polystore.dev/documentation#has)**
   */
  async has(key: string): Promise<boolean> {
    await this.#promise;
    const id = this.PREFIX + key;

    if (this.#adapter.has) {
      return this.#adapter.has(id);
    }

    return (await this.get(key)) !== null;
  }

  /**
   * Remove a single key and its value from the store:
   *
   * ```js
   * const key = await store.del("key1");
   * ```
   *
   * **[→ Full .del() Docs](https://polystore.dev/documentation#del)**
   */
  async del(key: string): Promise<string> {
    await this.#promise;
    const id = this.PREFIX + key;

    if (this.#adapter.del) {
      await this.#adapter.del(id);
      return key;
    }

    if (this.#adapter.HAS_EXPIRATION) {
      await this.#adapter.set(id, null, 0);
    } else {
      await this.#adapter.set(id, null);
    }

    return key;
  }

  /**
   * @alias of .del(key: string)
   * Remove a single key and its value from the store:
   *
   * ```js
   * const key = await store.delete("key1");
   * ```
   *
   * **[→ Full .del() Docs](https://polystore.dev/documentation#del)**
   */
  async delete(key: string): Promise<string> {
    return this.del(key);
  }

  /**
   * An iterator that goes through all of the key:value pairs in the store
   *
   * ```js
   * for await (const [key, value] of store) {
   *   console.log(key, value);
   * }
   * ```
   *
   * **[→ Full Iterator Docs](https://polystore.dev/documentation#iterator)**
   */
  [Symbol.asyncIterator](): AsyncGenerator<[string, TD], void, unknown>;
  [Symbol.asyncIterator]<T extends TD>(): AsyncGenerator<
    [string, T],
    void,
    unknown
  >;
  async *[Symbol.asyncIterator]<T extends TD = TD>(): AsyncGenerator<
    [string, T],
    void,
    unknown
  > {
    await this.#promise;
    this.#assertIterate();

    if (this.#adapter.HAS_EXPIRATION) {
      for await (const [name, data] of this.#adapter.iterate!<T>(this.PREFIX)) {
        const key = name.slice(this.PREFIX.length);
        yield [key, data];
      }
      return;
    }

    for await (const [name, data] of this.#adapter.iterate!<T>(this.PREFIX)) {
      const key = name.slice(this.PREFIX.length);
      if (this.#isFresh(data)) {
        yield [key, data.value];
      }
    }
  }

  /**
   * Return an array of the entries, in the [key, value] format:
   *
   * ```js
   * const entries = await store.entries();
   * // [["key1", "value1"], ["key2", { hello: "world" }], ...]
   *
   * // To limit it to a given prefix, use `.prefix()`:
   * const sessions = await store.prefix("session:").entries();
   * ```
   *
   * **[→ Full .entries() Docs](https://polystore.dev/documentation#entries)**
   */
  entries(): Promise<[string, TD][]>;
  entries<T extends TD>(): Promise<[string, T][]>;
  async entries<T extends TD = TD>(): Promise<[string, T][]> {
    await this.#promise;
    const trim = (key: string): string => key.slice(this.PREFIX.length);

    // With a native method
    if (this.#adapter.entries) {
      if (this.#adapter.HAS_EXPIRATION) {
        const entries = await this.#adapter.entries<T>(this.PREFIX);
        return entries.map(([k, v]) => [trim(k), v]);
      } else {
        const entries = await this.#adapter.entries<T>(this.PREFIX);
        return entries
          .map(([k, v]) => [trim(k), v] as const)
          .filter(([, data]) => this.#isFresh(data))
          .map(([key, data]) => [key, data.value]);
      }
    }

    // No native method, iterate then
    this.#assertIterate();
    if (this.#adapter.HAS_EXPIRATION) {
      const list: [string, T][] = [];
      for await (const [k, v] of this.#adapter.iterate!<T>(this.PREFIX)) {
        list.push([trim(k), v]);
      }
      return list;
    } else {
      const list: [string, T][] = [];
      for await (const [k, data] of this.#adapter.iterate!<T>(this.PREFIX)) {
        if (this.#isFresh(data)) {
          list.push([trim(k), data.value]);
        }
      }
      return list;
    }
  }

  /**
   * Return an array of the keys in the store:
   *
   * ```js
   * const keys = await store.keys();
   * // ["key1", "key2", ...]
   *
   * // To limit it to a given prefix, use `.prefix()`:
   * const sessions = await store.prefix("session:").keys();
   * ```
   *
   * **[→ Full .keys() Docs](https://polystore.dev/documentation#keys)**
   */
  async keys(): Promise<string[]> {
    await this.#promise;

    if (this.#adapter.keys) {
      const list = await this.#adapter.keys(this.PREFIX);
      if (!this.PREFIX) return list;
      return list.map((k) => k.slice(this.PREFIX.length));
    }

    const entries = await this.entries();
    return entries.map((e) => e[0]);
  }

  /**
   * Return an array of the values in the store:
   *
   * ```js
   * const values = await store.values();
   * // ["value1", { hello: "world" }, ...]
   *
   * // To limit it to a given prefix, use `.prefix()`:
   * const sessions = await store.prefix("session:").values();
   * ```
   *
   * **[→ Full .values() Docs](https://polystore.dev/documentation#values)**
   */
  values(): Promise<TD[]>;
  values<T extends TD>(): Promise<T[]>;
  async values<T extends TD = TD>(): Promise<T[]> {
    await this.#promise;

    if (this.#adapter.values) {
      if (this.#adapter.HAS_EXPIRATION) return this.#adapter.values<T>(this.PREFIX);
      const list = await this.#adapter.values<T>(this.PREFIX);
      return list
        .filter((data) => this.#isFresh(data))
        .map((data) => data.value);
    }

    const entries = await this.entries<T>();
    return entries.map((e) => e[1]);
  }

  /**
   * Return an object with the keys:values in the store:
   *
   * ```js
   * const obj = await store.all();
   * // { key1: "value1", key2: { hello: "world" }, ... }
   *
   * // To limit it to a given prefix, use `.prefix()`:
   * const sessions = await store.prefix("session:").all();
   * ```
   *
   * **[→ Full .all() Docs](https://polystore.dev/documentation#all)**
   */
  all(): Promise<Record<string, TD>>;
  all<T extends TD>(): Promise<Record<string, T>>;
  async all<T extends TD = TD>(): Promise<Record<string, T>> {
    const entries = await this.entries<T>();
    return Object.fromEntries(entries);
  }

  /**
   * Create a substore where all the keys are stored with
   * the given prefix:
   *
   * ```js
   * const session = store.prefix("session:");
   * await session.set("key1", "value1");
   * console.log(await session.entries());  // session.
   * // [["key1", "value1"]]
   * console.log(await store.entries());  // store.
   * // [["session:key1", "value1"]]
   * ```
   *
   * **[→ Full .prefix() Docs](https://polystore.dev/documentation#prefix)**
   */
  prefix(prefix: Prefix = ""): Store<TD> {
    const store = new Store<TD>(this.#adapter ?? this);
    store.PREFIX = this.PREFIX + prefix;
    store.EXPIRES = this.EXPIRES;
    return store;
  }

  /**
   * Create a substore where all the keys are stored with
   * the given prefix:
   *
   * ```js
   * const session = store.prefix("session:");
   * await session.set("key1", "value1");
   * console.log(await session.entries());  // session.
   * // [["key1", "value1"]]
   * console.log(await store.entries());  // store.
   * // [["session:key1", "value1"]]
   * ```
   *
   * **[→ Full .prefix() Docs](https://polystore.dev/documentation#prefix)**
   */
  expires(expires: Expires = null): Store<TD> {
    const store = new Store<TD>(this.#adapter ?? this);
    store.EXPIRES = parse(expires);
    store.PREFIX = this.PREFIX;
    return store;
  }

  /**
   * Delete all of the records of the store:
   *
   * ```js
   * await store.clear();
   * ```
   *
   * It's useful for cache invalidation, clearing the data, and testing.
   *
   * **[→ Full .clear() Docs](https://polystore.dev/documentation#clear)**
   */
  async clear(): Promise<void> {
    await this.#promise;

    // Some times we want to trigger a clearAll for no prefix, but need
    // to do it manually for prefix, so by having a clearAll and NOT clear()
    // we can do this (e.g. forage)
    if (!this.PREFIX && this.#adapter.clearAll) {
      return this.#adapter.clearAll();
    }

    if (this.#adapter.clear) {
      return this.#adapter.clear(this.PREFIX);
    }

    const keys = await this.keys();
    // Note: this gives trouble of concurrent deletes in the FS
    await Promise.all(keys.map((key) => this.del(key)));
  }

  /**
   * Remove all expired records from the store.
   *
   * ```js
   * await store.prune();
   * ```
   *
   * Only affects stores where expiration is managed by this wrapper.
   */
  async prune(): Promise<void> {
    await this.#promise;

    // Adapters with native expiration do not need pruning
    if (this.#adapter.HAS_EXPIRATION) return;

    if (this.#adapter.prune) {
      await this.#adapter.prune();
    }
  }

  /**
   * Stop the connection to the store, if any:
   *
   * ```js
   * await session.set("key1", "value1");
   * await store.close();
   * await session.set("key2", "value2");  // error
   * ```
   *
   * **[→ Full .close() Docs](https://polystore.dev/documentation#close)**
   */
  async close(): Promise<void> {
    await this.#promise;

    if (this.#adapter.close) {
      return this.#adapter.close();
    }
  }
}

export default function createStore(): Store<Serializable>;
// A custom adapter with a literal TYPE (e.g. `TYPE = "MYSTORE" as const`)
// narrows `store.type` to that literal
export default function createStore<A extends { TYPE: StoreType }>(
  adapter: A,
  options?: Options,
): Store<Serializable> & { type: A["TYPE"] };
export default function createStore<T extends Serializable = Serializable>(
  adapter?: any,
  options?: Options,
): Store<T>;
export default function createStore(adapter?: any, options?: Options): Store {
  return new Store(adapter, options);
}
// Export the store as a type alias rather than as the class itself, so
// that it can be used in annotations but `new Store()` and
// `instanceof Store` are compile errors; stores are created with kv()
type StoreInstance<TD extends Serializable = Serializable> = Store<TD>;
export type { Adapter, Options, Serializable, StoreType, StoreInstance as Store };
