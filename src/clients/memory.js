// Use a Map() as an in-memory client
export default class Memory {
  // Check if this is the right class for the given client
  static test(client) {
    return client instanceof Map;
  }

  constructor(client) {
    this.client = client;
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

  *iterate(prefix = "") {
    const entries = this.entries();
    for (const entry of entries) {
      if (!entry[0].startsWith(prefix)) continue;
      yield entry;
    }
  }

  // Group methods
  entries(prefix = "") {
    const entries = [...this.client.entries()];
    return entries.filter((p) => p[0].startsWith(prefix));
  }

  clear(prefix = "") {
    // Delete the whole dataset
    if (!prefix) return this.client.clear();

    // Delete them in a map
    const list = this.entries(prefix);
    return Promise.all(list.map((e) => e[0]).map((k) => this.del(k)));
  }
}
