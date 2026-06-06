import type { Namespace } from "etcd3";
import { Serializable } from "../types";
import Adapter from "./Adapter";

// Use a redis client to back up the store
export default class Etcd extends Adapter {
  TYPE = "ETCD3";

  // It desn't handle expirations natively
  HAS_EXPIRATION = false as const;

  // Check if this is the right class for the given client
  static testKeys = ["leaseClient", "watchClient", "watchManager"];

  get = async <T extends Serializable>(key: string) => {
    const data = await (this.lib as Namespace).get(key).json();
    return data as T;
  };

  set = async <T extends Serializable>(
    key: string,
    value: T,
  ): Promise<void> => {
    await (this.lib as Namespace).put(key).value(this.encode(value));
  };

  del = (key: string): Promise<void> => this.lib.delete().key(key).exec();

  async *iterate<T extends Serializable>(
    prefix = "",
  ): AsyncGenerator<[string, T]> {
    const keys: string[] = await this.lib.getAll().prefix(prefix).keys();
    for (const key of keys) {
      yield [key, await this.get<T>(key)];
    }
  }

  clear = async (prefix = ""): Promise<void> => {
    if (!prefix) return this.lib.delete().all();
    return this.lib.delete().prefix(prefix);
  };
}
