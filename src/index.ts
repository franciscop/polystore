import clients from "./clients/index";
import type { Client, Options, Serializable, StoreData } from "./types";
import { createId, parse, unix } from "./utils";

class Store<TDefault extends Serializable = Serializable> {
  PREFIX = "";
  promise: Promise<Client> | null;
  client!: Client;

  constructor(clientPromise: any = new Map()) {
    this.promise = Promise.resolve(clientPromise).then(async (client) => {
      this.client = this.#find(client);
      this.#validate(this.client);
      this.promise = null;
      await this.client.promise;
      return client;
    });
  }

  #find(store: any): Client {
    // Already a fully compliant KV store
    if (store instanceof Store) return store.client;

    // One of the supported ones, so we receive an instance and
    // wrap it with the client wrapper
    for (let client of Object.values(clients)) {
      if (client.test && client.test(store)) {
        // Some TS BS
        return new client(store) as Client;
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

  #validate(client: Client): void {
    if (!client) throw new Error("No client received");
    if (!client.set || !client.get || !client.iterate) {
      throw new Error("Client should have .get(), .set() and .iterate()");
    }

    // No need to validate the methods
    if (client.EXPIRES) return;

    for (let method of ["has", "keys", "values"]) {
      if ((client as any)[method]) {
        const msg = `You can only define client.${method}() when the client manages the expiration.`;
        throw new Error(msg);
      }
    }
  }

  // Check if the given data is fresh or not; if
  #isFresh(data: any, key?: string): data is StoreData {
    // Should never happen, but COULD happen; schedule it for
    // removal and mark it as stale
    if (!data || typeof data !== "object" || !("value" in data)) {
      if (key) this.del(key);
      return false;
    }

    // It never expires, so keep it
    if (data.expires === null) return true;

    // It's fresh, keep it
    if (data.expires > Date.now()) return true;

    // It's expired, remove it
    if (key) this.del(key);
    return false;
  }

  add(value: TDefault, options?: Options): Promise<string>;
  add<T extends TDefault>(value: T, options?: Options): Promise<string>;
  async add<T extends TDefault = TDefault>(
    value: T,
    options: Options = {},
  ): Promise<string> {
    await this.promise;
    let expires: number | null = parse(options.expires);

    // Use the underlying one from the client if found
    if (this.client.add) {
      if (this.client.EXPIRES) {
        return await this.client.add(this.PREFIX, value, { expires });
      }

      // In the data we need the timestamp since we need it "absolute":
      expires = unix(expires);
      const key = await this.client.add(this.PREFIX, { expires, value });
      return key;
    }

    const key = createId();
    return this.set(key, value, { expires });
  }

  set(key: string, value: TDefault, options?: Options): Promise<string>;
  set<T extends TDefault>(
    key: string,
    value: T,
    options?: Options,
  ): Promise<string>;
  async set<T extends Serializable = TDefault>(
    key: string,
    value: T,
    options: Options = {},
  ): Promise<string> {
    await this.promise;
    const id = this.PREFIX + key;
    let expires: number | null = parse(options.expires);

    // Quick delete
    if (value === null || (typeof expires === "number" && expires <= 0)) {
      return this.del(key);
    }

    // The client manages the expiration, so let it manage it
    if (this.client.EXPIRES) {
      await this.client.set<T>(id, value, { expires });
      return key;
    }

    // In the data we need the timestamp since we need it "absolute":
    expires = unix(expires);
    await this.client.set(id, { expires, value });
    return key;
  }

  get(key: string): Promise<TDefault | null>;
  get<T extends TDefault>(key: string): Promise<T | null>;
  async get<T extends TDefault = TDefault>(key: string): Promise<T | null> {
    await this.promise;
    const id = this.PREFIX + key;

    // The client already managed expiration and there's STILL some data,
    // so we can assume it's the raw user data
    if (this.client.EXPIRES) {
      const data = (await this.client.get<T>(id)) ?? null;

      // No value; nothing to do/check
      if (data === null) return null;

      return data;
    } else {
      const data = (await this.client.get<T>(id)) ?? null;

      // No value; nothing to do/check
      if (data === null) return null;

      if (!this.#isFresh(data, key)) return null;
      return data.value;
    }
  }

  async has(key: string): Promise<boolean> {
    await this.promise;
    const id = this.PREFIX + key;

    if (this.client.has) {
      return this.client.has(id);
    }

    return (await this.get(key)) !== null;
  }

  async del(key: string): Promise<string> {
    await this.promise;
    const id = this.PREFIX + key;

    if (this.client.del) {
      await this.client.del(id);
      return key;
    }

    if (this.client.EXPIRES) {
      await this.client.set(id, null, { expires: 0 });
    } else {
      await this.client.set(id, null);
    }

    return key;
  }

  [Symbol.asyncIterator](): AsyncGenerator<[string, TDefault], void, unknown>;
  [Symbol.asyncIterator]<T extends TDefault>(): AsyncGenerator<
    [string, T],
    void,
    unknown
  >;
  async *[Symbol.asyncIterator]<
    T extends TDefault = TDefault,
  >(): AsyncGenerator<[string, T], void, unknown> {
    await this.promise;

    if (this.client.EXPIRES) {
      for await (const [name, data] of this.client.iterate<T>(this.PREFIX)) {
        const key = name.slice(this.PREFIX.length);
        yield [key, data];
      }
      return;
    }

    for await (const [name, data] of this.client.iterate<T>(this.PREFIX)) {
      const key = name.slice(this.PREFIX.length);
      if (this.#isFresh(data, key)) {
        yield [key, data.value];
      }
    }
  }

  entries(): Promise<[string, TDefault][]>;
  entries<T extends TDefault>(): Promise<[string, T][]>;
  async entries<T extends TDefault = TDefault>(): Promise<[string, T][]> {
    await this.promise;
    const trim = (key: string): string => key.slice(this.PREFIX.length);

    // With a native method
    if (this.client.entries) {
      if (this.client.EXPIRES) {
        const entries = await this.client.entries<T>(this.PREFIX);
        return entries.map(([k, v]) => [trim(k), v]);
      } else {
        const entries = await this.client.entries<T>(this.PREFIX);
        return entries
          .map(([k, v]) => [trim(k), v] as const)
          .filter(([key, data]) => this.#isFresh(data, key))
          .map(([key, data]) => [key, data.value]);
      }
    }

    // No native method, iterate then
    if (this.client.EXPIRES) {
      const list: [string, T][] = [];
      for await (const [k, v] of this.client.iterate<T>(this.PREFIX)) {
        list.push([trim(k), v]);
      }
      return list;
    } else {
      const list: [string, T][] = [];
      for await (const [k, data] of this.client.iterate<T>(this.PREFIX)) {
        if (this.#isFresh(data, trim(k))) {
          list.push([trim(k), data.value]);
        }
      }
      return list;
    }
  }

  async keys(): Promise<string[]> {
    await this.promise;

    if (this.client.keys) {
      const list = await this.client.keys(this.PREFIX);
      if (!this.PREFIX) return list;
      return list.map((k) => k.slice(this.PREFIX.length));
    }

    const entries = await this.entries();
    return entries.map((e) => e[0]);
  }

  values(): Promise<TDefault[]>;
  values<T extends TDefault>(): Promise<T[]>;
  async values<T extends TDefault = TDefault>(): Promise<T[]> {
    await this.promise;

    if (this.client.values) {
      if (this.client.EXPIRES) return this.client.values<T>(this.PREFIX);
      const list = await this.client.values<T>(this.PREFIX);
      return list
        .filter((data) => this.#isFresh(data))
        .map((data) => data.value);
    }

    const entries = await this.entries<T>();
    return entries.map((e) => e[1]);
  }

  all(): Promise<Record<string, TDefault>>;
  all<T extends TDefault>(): Promise<Record<string, T>>;
  async all<T extends TDefault = TDefault>(): Promise<Record<string, T>> {
    const entries = await this.entries<T>();
    return Object.fromEntries(entries);
  }

  async clear(): Promise<void> {
    await this.promise;

    if (!this.PREFIX && this.client.clearAll) {
      return this.client.clearAll();
    }

    if (this.client.clear) {
      return this.client.clear(this.PREFIX);
    }

    const keys = await this.keys();
    // Note: this gives trouble of concurrent deletes in the FS
    await Promise.all(keys.map((key) => this.del(key)));
  }

  prefix(prefix = ""): Store<TDefault> {
    const store = new Store<TDefault>(
      Promise.resolve(this.promise).then(() => this.client),
    );
    store.PREFIX = this.PREFIX + prefix;
    return store;
  }

  async close(): Promise<void> {
    await this.promise;

    if (this.client.close) {
      return this.client.close();
    }
  }
}

export default function createStore(): Store<Serializable>;
export default function createStore<T extends Serializable = Serializable>(
  client?: any,
): Store<T>;
export default function createStore(client?: any): Store {
  return new Store(client);
}
export type { Client, Serializable, Store };
