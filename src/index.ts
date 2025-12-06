export type Serializable =
  | string
  | number
  | boolean
  | null
  | Record<string, any>
  | Serializable[]
  | Date;

export interface StoreData<T = Serializable> {
  value: T;
  timestamp: number;
  ttl: number;
}

export type Value = Serializable;

export interface ExpiresClient {
  EXPIRES: true;
  promise?: Promise<any>;
  test?: (client: any) => boolean;
  get<T = Value>(key: string): Promise<T | null> | T | null;
  set<T = Value>(key: string, value: T, options?: any): Promise<any> | any;
  iterate<T = Value>(
    prefix: string,
  ):
    | AsyncGenerator<[string, T], void, unknown>
    | Generator<[string, T], void, unknown>;
  add?(prefix: string, value: Value, options?: any): Promise<string>;
  has?(key: string): Promise<boolean> | boolean;
  del?(key: string): Promise<any> | any;
  keys?(prefix: string): Promise<string[]> | string[];
  values?<T = Value>(prefix: string): Promise<T[]> | T[];
  entries?<T = Value>(prefix: string): Promise<[string, T][]> | [string, T][];
  all?<T = Value>(
    prefix: string,
  ): Promise<Record<string, T>> | Record<string, T>;
  clear?(prefix: string): Promise<any> | any;
  clearAll?(): Promise<any> | any;
  close?(): Promise<any> | any;
}

export interface NonExpiresClient {
  EXPIRES?: false;
  promise?: Promise<any>;
  test?: (client: any) => boolean;
  get<T = Value>(
    key: string,
  ): Promise<StoreData<T> | null> | StoreData<T> | null;
  set<T = Value>(
    key: string,
    value: StoreData<T>,
    options?: any,
  ): Promise<any> | any;
  iterate<T = Value>(
    prefix: string,
  ):
    | AsyncGenerator<[string, StoreData<T>], void, unknown>
    | Generator<[string, StoreData<T>], void, unknown>;
  add?(prefix: string, value: Value, options?: any): Promise<string>;
  has?(key: string): Promise<boolean> | boolean;
  del?(key: string): Promise<any> | any;
  keys?(prefix: string): Promise<string[]> | string[];
  values?<T = Value>(prefix: string): Promise<StoreData<T>[]> | StoreData<T>[];
  entries?<T = Value>(
    prefix: string,
  ): Promise<[string, StoreData<T>][] | [string, StoreData<T>]>;
  all?<T = Value>(
    prefix: string,
  ): Promise<Record<string, StoreData<T>>> | Record<string, StoreData<T>>;
  clear?(prefix: string): Promise<any> | any;
  clearAll?(): Promise<any> | any;
  close?(): Promise<any> | any;
}

export type ClientInterface = ExpiresClient | NonExpiresClient;

export class Store<C extends ClientInterface> {
  private PREFIX: string;
  private client: C;
  private promise: Promise<any>;

  constructor(prefix: string, client: C) {
    this.PREFIX = prefix;
    this.client = client;
    this.promise = client.promise ?? Promise.resolve();
  }

  private isFresh<T>(data: StoreData<T>): boolean {
    return Date.now() - data.timestamp <= data.ttl;
  }

  async get<T extends Serializable>(key: string): Promise<T | null> {
    await this.promise;
    const id = this.PREFIX + key;
    const data = await this.client.get<T>(id);
    if (data === null) return null;
    if (this.client.EXPIRES) return data as T;
    const d = data as StoreData<T>;
    if (!this.isFresh(d)) return null;
    return d.value;
  }

  async *[Symbol.asyncIterator]<T extends Serializable>(): AsyncGenerator<
    [string, T],
    void,
    unknown
  > {
    await this.promise;
    for await (const [name, entry] of this.client.iterate<T>(this.PREFIX)) {
      const key = name.slice(this.PREFIX.length);
      if (this.client.EXPIRES) {
        yield [key, entry as T];
      } else {
        const data = entry as StoreData<T>;
        if (this.isFresh(data)) yield [key, data.value];
      }
    }
  }

  async entries<T extends Serializable>(): Promise<[string, T][]> {
    await this.promise;
    const trim = (k: string) => k.slice(this.PREFIX.length);

    let raw: ([string, T] | [string, StoreData<T>])[] = [];

    if (this.client.entries) {
      const list = await this.client.entries(this.PREFIX);

      if (this.client.EXPIRES) {
        raw = (list as [string, T][]).map(([k, v]) => [trim(k), v]);
      } else {
        raw = (list as [string, StoreData<T>][]).map(([k, v]) => [trim(k), v]);
      }
    } else {
      for await (const pair of this.client.iterate(this.PREFIX)) {
        if (this.client.EXPIRES) {
          const [k, v] = pair as [string, T];
          raw.push([trim(k), v]);
        } else {
          const [k, v] = pair as [string, StoreData<T>];
          raw.push([trim(k), v]);
        }
      }
    }

    if (this.client.EXPIRES) return raw as [string, T][];

    return raw
      .filter(([_, d]) => this.isFresh(d as StoreData<T>))
      .map(([k, d]) => [k, (d as StoreData<T>).value]);
  }

  async values<T extends Serializable>(): Promise<T[]> {
    await this.promise;

    if (this.client.values) {
      const list = await this.client.values<T>(this.PREFIX);
      if (this.client.EXPIRES) return list as T[];

      return (list as StoreData<T>[])
        .filter((d) => this.isFresh(d))
        .map((d) => d.value);
    }

    const e = await this.entries<T>();
    return e.map(([_, v]) => v);
  }

  async all<T extends Serializable>(): Promise<Record<string, T>> {
    await this.promise;

    if (this.client.all) {
      const obj = await this.client.all<T>(this.PREFIX);

      if (this.client.EXPIRES) {
        const out: Record<string, T> = {};
        const typed = obj as Record<string, T>;
        for (const k in typed) out[k.slice(this.PREFIX.length)] = typed[k];
        return out;
      }

      const out: Record<string, T> = {};
      for (const k in obj) {
        const data = obj[k] as StoreData<T>;
        const key = k.slice(this.PREFIX.length);
        if (this.isFresh(data)) out[key] = data.value;
      }
      return out;
    }

    return Object.fromEntries(await this.entries<T>());
  }
}
