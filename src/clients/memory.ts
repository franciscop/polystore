import Client from "./Client.js";

// Use a Map() as an in-memory client
export default class Memory extends Client {
  // Check if this is the right class for the given client
  static test = (client: any): boolean => client instanceof Map;

  get = (key: string): any => this.client.get(key) ?? null;
  set = (key: string, data: any): Map<string, any> => this.client.set(key, data);
  del = (key: string): boolean => this.client.delete(key);

  *iterate(prefix = ""): Generator<[string, any], void, unknown> {
    for (const entry of this.client.entries()) {
      if (entry[0].startsWith(prefix)) yield entry;
    }
  }

  clearAll = (): void => this.client.clear();
}
