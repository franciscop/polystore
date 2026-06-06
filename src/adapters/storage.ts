import Adapter from "./Adapter";

// A client that uses a single file (JSON) as a store
export default class WebStorage extends Adapter {
  TYPE = "STORAGE";

  // It desn't handle expirations natively
  HAS_EXPIRATION = false as const;

  // Check if this is the right class for the given client
  static test(raw: any): boolean {
    if (typeof Storage === "undefined") return false;
    return raw instanceof Storage;
  }

  // Item methods
  get = (key: string): any => this.decode(this.lib.getItem(key));
  set = (key: string, data: any): void =>
    this.lib.setItem(key, this.encode(data));
  del = (key: string): void => this.lib.removeItem(key);

  *iterate(prefix = ""): Generator<[string, any], void, unknown> {
    for (let i = 0; i < this.lib.length; i++) {
      const key = this.lib.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const value = this.get(key);
      if (value !== null && value !== undefined) {
        yield [key, value];
      }
    }
  }

  clearAll = (): void => this.lib.clear();
}
