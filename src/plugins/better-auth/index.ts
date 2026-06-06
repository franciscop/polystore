import kv from "polystore";
import type { Store } from "polystore";

type SecondaryStorage = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
};

export class PolystoreBetterAuthStorage implements SecondaryStorage {
  private store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  prefix(prefix = ""): PolystoreBetterAuthStorage {
    return new PolystoreBetterAuthStorage(this.store.prefix(prefix));
  }

  get(key: string): Promise<string | null> {
    return this.store.get<string>(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    await this.store.set(key, value, ttl ? { expires: ttl } : undefined);
  }

  async delete(key: string): Promise<void> {
    await this.store.del(key);
  }
}

export default function betterAuthStorage(store: any = new Map()): PolystoreBetterAuthStorage {
  return new PolystoreBetterAuthStorage(kv(store));
}
