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
    if (data === null) {
      this.client.removeItem(key);
    } else {
      this.client.setItem(key, JSON.stringify(data));
    }
    return key;
  }

  *iterate(prefix = "") {
    const entries = this.entries(prefix);
    for (const entry of entries) {
      yield entry;
    }
  }

  // Group methods
  entries(prefix = "") {
    const entries = Object.entries(this.client);
    return entries
      .map((p) => [p[0], p[1] ? JSON.parse(p[1]) : null])
      .filter((p) => p[0].startsWith(prefix));
  }

  clear(prefix = "") {
    // Delete the whole store
    if (!prefix) return this.client.clear();

    // Delete them in a map
    return this.entries(prefix).map((e) => this.set(e[0], null));
  }
}
