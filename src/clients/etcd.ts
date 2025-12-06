import { Serializable } from "../types";
import Client from "./Client";

// Use a redis client to back up the store
export default class Etcd extends Client {
  // Check if this is the right class for the given client
  static test = (client: any): boolean => client?.constructor?.name === "Etcd3";

  get = (key: string): Promise<Serializable> => this.client.get(key).json();
  set = (key: string, value: Serializable): Promise<void> =>
    this.client.put(key).value(this.encode(value));
  del = (key: string): Promise<void> => this.client.delete().key(key).exec();

  async *iterate(prefix = ""): AsyncGenerator<[string, Serializable]> {
    const keys: string[] = await this.client.getAll().prefix(prefix).keys();
    for (const key of keys) {
      yield [key, await this.get(key)];
    }
  }

  keys = (prefix = ""): Promise<string[]> =>
    this.client.getAll().prefix(prefix).keys();
  entries = async (prefix = ""): Promise<[string, Serializable][]> => {
    const keys = await this.keys(prefix);
    const values = await Promise.all(keys.map((k) => this.get(k)));
    return keys.map((k, i) => [k, values[i]]);
  };
  clear = async (prefix = ""): Promise<void> => {
    if (!prefix) return this.client.delete().all();
    return this.client.delete().prefix(prefix);
  };
}
