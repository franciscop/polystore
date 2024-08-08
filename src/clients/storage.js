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
  get(key) {
    const data = this.client[key];
    return data ? JSON.parse(data) : null;
  }

  set(key, data) {
    return this.client.setItem(key, JSON.stringify(data));
  }

  del(key) {
    return this.client.removeItem(key);
  }

  *iterate(prefix = "") {
    for (const key of Object.keys(this.client)) {
      if (!key.startsWith(prefix)) continue;
      const value = this.get(key);
      if (!value) continue;
      yield [key, value];
    }
  }

  clear(prefix = "") {
    // Delete the whole store
    if (!prefix) return this.client.clear();

    // Delete them in a map
    return Object.keys(this.client)
      .filter((k) => k.startsWith(prefix))
      .map((k) => this.del(k));
  }
}
