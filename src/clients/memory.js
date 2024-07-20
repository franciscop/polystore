import Client from "../Client.js";

// Use a Map() as an in-memory client
export default class Memory extends Client {
  // Indicate if this client handles expirations (true = it does)
  EXPIRES = false;

  // Check if this is the right class for the given client
  static test(client) {
    return client instanceof Map;
  }

  get(key) {
    return this.client.get(key) ?? null;
  }

  set(key, data) {
    this.client.set(key, data);
  }

  del(key) {
    this.client.delete(key);
  }

  // Group methods
  entries(prefix = "") {
    const entries = [...this.client.entries()];
    return entries.filter((p) => p[0].startsWith(prefix));
  }

  keys(prefix = "") {
    const entries = [...this.client.keys()];
    return entries.filter((key) => key.startsWith(prefix));
  }

  clear(prefix = "") {
    // Delete the whole dataset
    if (!prefix) return this.client.clear();

    // Delete them in a map
    const list = this.entries(prefix);
    return Promise.all(list.map((e) => e[0]).map((k) => this.del(k)));
  }
}
