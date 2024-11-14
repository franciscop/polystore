import Client from "./Client";

// A client that uses a single file (JSON) as a store
export default class WebStorage extends Client {
  // Check if this is the right class for the given client
  static test(client) {
    if (typeof Storage === "undefined") return false;
    return client instanceof Storage;
  }

  // Item methods
  get = (key) => this.decode(this.client[key]);
  set = (key, data) => this.client.setItem(key, this.encode(data));
  del = (key) => this.client.removeItem(key);

  *iterate(prefix = "") {
    for (const key of Object.keys(this.client)) {
      if (!key.startsWith(prefix)) continue;
      const value = this.get(key);
      if (value) yield [key, value];
    }
  }

  clearAll = () => this.client.clear();
}
