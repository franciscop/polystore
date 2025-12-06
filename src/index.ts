import clients from "./clients/index";
import { Options, Serializable } from "./types";
import { createId, parse, unix } from "./utils";

interface ExpiresInterface {
  EXPIRES: true;
  promise?: Promise<any>;
  test?: (client: any) => boolean;
  get<T extends Serializable>(key: string): Promise<T | null> | T | null;
  set<T extends Serializable>(
    key: string,
    value: T,
    options?: Options,
  ): Promise<any> | any;
  iterate<T extends Serializable>(
    prefix: string,
  ):
    | AsyncGenerator<[string, T], void, unknown>
    | Generator<[string, T], void, unknown>;
  add?<T extends Serializable>(
    prefix: string,
    value: T,
    options?: Options,
  ): Promise<string>;
  has?(key: string): Promise<boolean> | boolean;
  del?(key: string): Promise<any> | any;
  keys?(prefix: string): Promise<string[]> | string[];
  values?<T extends Serializable>(prefix: string): Promise<T[]> | T[];
  entries?<T extends Serializable>(
    prefix: string,
  ): Promise<[string, T][]> | [string, T][];
  all?<T extends Serializable>(
    prefix: string,
  ): Promise<Record<string, T>> | Record<string, T>;
  clear?(prefix: string): Promise<any> | any;
  clearAll?(): Promise<any> | any;
  close?(): Promise<any> | any;
}

type StoreData<T extends Serializable = Serializable> = {
  value: T;
  expires: number | null;
};
interface NonExpiresInterface {
  EXPIRES?: false;
  promise?: Promise<any>;
  test?: (client: any) => boolean;
  get<T extends Serializable>(
    key: string,
  ): Promise<StoreData<T> | null> | StoreData<T> | null;
  set<T extends Serializable>(
    key: string,
    value: StoreData<T> | null,
    options?: Options,
  ): Promise<any> | any;
  iterate<T extends Serializable>(
    prefix: string,
  ):
    | AsyncGenerator<[string, StoreData<T>], void, unknown>
    | Generator<[string, StoreData<T>], void, unknown>;
  add?<T extends Serializable>(
    prefix: string,
    value: StoreData<T>,
    options?: Options,
  ): Promise<string>;
  has?(key: string): Promise<boolean> | boolean;
  del?(key: string): Promise<any> | any;
  keys?(prefix: string): Promise<string[]> | string[];
  values?<T extends Serializable>(
    prefix: string,
  ): Promise<StoreData<T>[]> | StoreData<T>[];
  entries?<T extends Serializable>(
    prefix: string,
  ): Promise<[string, StoreData<T>][]> | [string, StoreData<T>][];
  all?<T extends Serializable>(
    prefix: string,
  ): Promise<Record<string, StoreData<T>>> | Record<string, StoreData<T>>;
  clear?(prefix: string): Promise<any> | any;
  clearAll?(): Promise<any> | any;
  close?(): Promise<any> | any;
}

type Client = ExpiresInterface | NonExpiresInterface;

class Store {
  PREFIX = "";
  promise: Promise<any> | null;
  client!: Client;

  constructor(clientPromise: any) {
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
        const c = new client(store);
        if (c.EXPIRES) return c as ExpiresInterface;
        return c as NonExpiresInterface;
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

  async add<T extends Serializable>(
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

  async set<T extends Serializable>(
    key: string,
    value: T,
    options: Options = {},
  ): Promise<string> {
    await this.promise;
    const id = this.PREFIX + key;
    let expires: number | null = parse(options.expires);

    // Quick delete
    if (value === null || (typeof expires === "number" && expires <= 0)) {
      return this.del(id);
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

  async get<T extends Serializable = Serializable>(
    key: string,
  ): Promise<T | null> {
    await this.promise;
    const id = this.PREFIX + key;

    const data = (await this.client.get<T>(id)) ?? null;

    // No value; nothing to do/check
    if (data === null) return null;

    // The client already managed expiration and there's STILL some data,
    // so we can assume it's the raw user data
    if (this.client.EXPIRES) return data as T;

    if (!this.#isFresh(data, key)) return null;
    return data.value as T;
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

  async *[Symbol.asyncIterator]<
    T extends Serializable = Serializable,
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

  async entries<T extends Serializable = Serializable>(): Promise<
    [string, T][]
  > {
    await this.promise;
    const trim = (key: string): string => key.slice(this.PREFIX.length);

    let list: Array<[string, T] | [string, StoreData<T>]> = [];

    if (this.client.entries) {
      const entries = await this.client.entries(this.PREFIX);
      if (this.client.EXPIRES) {
        list = (entries as [string, T][]).map(([k, v]) => [trim(k), v]);
      } else {
        list = (entries as [string, StoreData<T>][]).map(([k, v]) => [
          trim(k),
          v,
        ]);
      }
    } else {
      for await (const pair of this.client.iterate(this.PREFIX)) {
        if (this.client.EXPIRES) {
          const [k, v] = pair as [string, T];
          list.push([trim(k), v]);
        } else {
          const [k, v] = pair as [string, StoreData<T>];
          list.push([trim(k), v]);
        }
      }
    }

    if (this.client.EXPIRES) return list as [string, T][];

    const out: [string, T][] = [];
    for (const [key, data] of list) {
      if (this.#isFresh(data, key))
        out.push([key, (data as StoreData<T>).value]);
    }
    return out;
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

  async values<T extends Serializable>(): Promise<T[]> {
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

  async all<T extends Serializable>(): Promise<Record<string, T>> {
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
