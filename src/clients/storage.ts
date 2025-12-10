import Client from "./Client";

// A client that uses a single file (JSON) as a store
export default class WebStorage extends Client {
  // Check if this is the right class for the given client
  static test(client: any): boolean {
    if (typeof Storage === "undefined") return false;
    return client instanceof Storage;
  }

  // Item methods
  get = (key: string): any => this.decode(this.client.getItem(key));
  set = (key: string, data: any): void =>
    this.client.setItem(key, this.encode(data));
  del = (key: string): void => this.client.removeItem(key);

  *iterate(prefix = ""): Generator<[string, any], void, unknown> {
    for (let i = 0; i < this.client.length; i++) {
      const key = this.client.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const value = this.get(key);
      if (value !== null && value !== undefined) {
        yield [key, value];
      }
    }
  }

  clearAll = (): void => this.client.clear();
}
