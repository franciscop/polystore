// A client that uses a single file (JSON) as a store
export default class WebStorage {
  // Check if this is the right class for the given client
  static test(client) {
    if (typeof Storage === "undefined") return false;
    return client instanceof Storage;
  }

  constructor(client) {
    this.client = client;
  }

  // Item methods
  get = (key) => {
    const text = this.client[key];
    return text ? JSON.parse(text) : null;
  };
  set = (key, data) => this.client.setItem(key, JSON.stringify(data));
  del = (key) => this.client.removeItem(key);

  *iterate(prefix = "") {
    for (const key of Object.keys(this.client)) {
      if (!key.startsWith(prefix)) continue;
      const value = this.get(key);
      if (!value) continue;
      yield [key, value];
    }
  }

  clearAll = () => this.client.clear();
}
