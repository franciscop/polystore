import Adapter from "./Adapter";

// Use localForage for managing the KV
export default class Forage extends Adapter {
  TYPE = "FORAGE";

  // It desn't handle expirations natively
  HAS_EXPIRATION = false as const;

  // Check if this is the right class for the given client
  static test = (raw: any): boolean =>
    raw?.defineDriver && raw?.dropInstance && raw?.INDEXEDDB;

  get = (key: string): Promise<any> => this.lib.getItem(key);
  set = (key: string, value: any): Promise<any> =>
    this.lib.setItem(key, value);
  del = (key: string): Promise<void> => this.lib.removeItem(key);

  async *iterate(prefix = ""): AsyncGenerator<[string, any], void, unknown> {
    const keys: string[] = await this.lib.keys();
    const list = keys.filter((k) => k.startsWith(prefix));
    for (const key of list) {
      const value = await this.get(key);
      if (value !== null && value !== undefined) {
        yield [key, value];
      }
    }
  }

  entries = async (prefix = ""): Promise<[string, any][]> => {
    const all: string[] = await this.lib.keys();
    const keys = all.filter((k) => k.startsWith(prefix));
    const values = await Promise.all(keys.map((key) => this.get(key)));
    return keys.map((key, i) => [key, values[i]]);
  };

  clearAll = (): Promise<void> => this.lib.clear();
}
