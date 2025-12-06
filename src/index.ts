import clients from "./clients/index";
import { Serializable } from "./types";
import { createId, parse, unix } from "./utils";

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
  iterate(
    prefix: string,
  ):
    | AsyncGenerator<[string, Value], void, unknown>
    | Generator<[string, Value], void, unknown>;
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

interface StoreData {
  value: Value;
  expires: number | null;
}

class Store {
  PREFIX = "";
  promise: Promise<any> | null;
  client!: ClientInterface;

  constructor(clientPromise: any) {
    this.promise = Promise.resolve(clientPromise).then(async (client) => {
      this.client = this.#find(client);
      this.#validate(this.client);
      this.promise = null;
      await this.client.promise;
      return client;
    });
  }

  #find(store: any): ClientInterface {
    // Already a fully compliant KV store
    if (store instanceof Store) return store.client;

    // One of the supported ones, so we receive an instance and
    // wrap it with the client wrapper
    for (let client of Object.values(clients)) {
      if (client.test && client.test(store)) {
        return new client(store);
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

  #validate(client: ClientInterface): void {
    if (!client) throw new Error("No client received");
    if (!client.set || !client.get || !client.iterate) {
      throw new Error("Client should have .get(), .set() and .iterate()");
    }

    if (!client.EXPIRES) {
      for (let method of ["has", "keys", "values"]) {
        if ((client as any)[method]) {
          throw new Error(
            `You can only define client.${method}() when the client manages the expiration.`,
          );
        }
      }
    }
  }

  // Check if the given data is fresh or not; if
  #isFresh(data: any, key?: string): data is StoreData {
    // Should never happen, but COULD happen; schedule it for
    // removal and mark it as stale
    if (!data || !data.value || typeof data !== "object") {
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

  async add<T = Serializable>(
    value: T,
    options: Options = {},
  ): Promise<string> {
    await this.promise;
    let expires: number | null = parse(options.expire ?? options.expires);

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

  async set<T = Serializable>(
    key: string,
    value: T,
    options: Options = {},
  ): Promise<string> {
    await this.promise;
    const id = this.PREFIX + key;
    let expires: number | null = parse(options.expire ?? options.expires);

    // Quick delete
    if (value === null || (typeof expires === "number" && expires <= 0)) {
      return this.del(id);
    }

    // The client manages the expiration, so let it manage it
    if (this.client.EXPIRES) {
      await this.client.set(id, value, { expires });
      return key;
    }

    // In the data we need the timestamp since we need it "absolute":
    expires = unix(expires);
    await this.client.set(id, { expires, value });
    return key;
  }

  async get<T = Serializable>(key: string): Promise<T | null> {
    await this.promise;
    const id = this.PREFIX + key;

    const data = (await this.client.get(id)) ?? null;

    // No value; nothing to do/check
    if (data === null) return null;

    // The client already managed expiration and there's STILL some data,
    // so we can assume it's the raw user data
    if (this.client.EXPIRES) return data;

    if (!this.#isFresh(data, key)) return null;
    return data.value;
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

    await this.client.set(id, null, { expires: 0 });
    return key;
  }

  async *[Symbol.asyncIterator]<T = Serializable>(): AsyncGenerator<
    [string, T],
    void,
    unknown
  > {
    await this.promise;

    for await (const [name, data] of this.client.iterate(this.PREFIX)) {
      const key = name.slice(this.PREFIX.length);
      if (this.client.EXPIRES) {
        yield [key, data];
      } else if (this.#isFresh(data, key)) {
        yield [key, data.value];
      }
    }
  }

  async entries<T = Serializable>(): Promise<[string, T][]> {
    await this.promise;

    // Cut the key to size
    const trim = (key: string): string => key.slice(this.PREFIX.length);

    let list: [string, T][] = [];
    if (this.client.entries) {
      const entries = await this.client.entries(this.PREFIX);
      list = entries.map(([key, value]) => [trim(key), value] as [string, T]);
    } else {
      for await (const [key, value] of this.client.iterate(this.PREFIX)) {
        list.push([trim(key), value]);
      }
    }

    // The client already manages the expiration, so we can assume
    // that at this point, all entries are not-expired
    if (this.client.EXPIRES) return list;

    // We need to do manual expiration checking
    return list
      .filter(([key, data]) => this.#isFresh(data, key))
      .map(([key, data]) => [key, (data as StoreData).value] as [string, T]);
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

  async values<T = Serializable>(): Promise<T[]> {
    await this.promise;

    if (this.client.values) {
      const list = await this.client.values(this.PREFIX);
      if (this.client.EXPIRES) return list;
      return list
        .filter((data) => this.#isFresh(data))
        .map((data) => (data as StoreData).value);
    }

    const entries = await this.entries<T>();
    return entries.map((e) => e[1]);
  }

  async all<T = Serializable>(): Promise<Record<string, T>> {
    await this.promise;

    if (this.client.all) {
      const obj = await this.client.all(this.PREFIX);
      if (!this.PREFIX) return obj;
      const all: Record<string, T> = {};
      for (let key in obj) {
        all[key.slice(this.PREFIX.length)] = obj[key];
      }
      return all;
    }

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

  prefix(prefix = ""): Store {
    const store = new Store(
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

export default (client?: any): Store => new Store(client);
export type { Store };
