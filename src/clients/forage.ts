import Client from "./Client";

// Use localForage for managing the KV
export default class Forage extends Client {
  // Check if this is the right class for the given client
  static test = (client: any): boolean =>
    client?.defineDriver && client?.dropInstance && client?.INDEXEDDB;

  get = (key: string): Promise<any> => this.client.getItem(key);
  set = (key: string, value: any): Promise<any> =>
    this.client.setItem(key, value);
  del = (key: string): Promise<void> => this.client.removeItem(key);

  async *iterate(prefix = ""): AsyncGenerator<[string, any], void, unknown> {
    const keys: string[] = await this.client.keys();
    const list = keys.filter((k) => k.startsWith(prefix));
    for (const key of list) {
      yield [key, await this.get(key)];
    }
  }

  entries = async (prefix = ""): Promise<[string, any][]> => {
    const all: string[] = await this.client.keys();
    const keys = all.filter((k) => k.startsWith(prefix));
    const values = await Promise.all(keys.map((key) => this.get(key)));
    return keys.map((key, i) => [key, values[i]]);
  };

  clearAll = (): Promise<void> => this.client.clear();
}
