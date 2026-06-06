import Adapter from "./Adapter";

// Use a Map() as an in-memory client
export default class Memory extends Adapter {
  TYPE = "MEMORY";

  // It desn't handle expirations natively
  HAS_EXPIRATION = false as const;

  // Check if this is the right class for the given client
  static test = (raw: any): boolean => raw instanceof Map;

  get = (key: string): any => this.lib.get(key) ?? null;
  set = (key: string, data: any): Map<string, any> =>
    this.lib.set(key, data);
  del = (key: string): boolean => this.lib.delete(key);

  *iterate(prefix = ""): Generator<[string, any], void, unknown> {
    for (const entry of this.lib.entries()) {
      if (entry[0].startsWith(prefix)) yield entry;
    }
  }

  clearAll = (): void => this.lib.clear();
}
