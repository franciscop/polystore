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
    return this.client.set(key, data);
  }

  del(key) {
    return this.client.delete(key);
  }

  *iterate(prefix = "") {
    for (const entry of this.client.entries()) {
      if (!entry[0].startsWith(prefix)) continue;
      yield entry;
    }
  }

  clear(prefix = "") {
    // Delete the whole dataset
    if (!prefix) return this.client.clear();

    // Delete them in a map
    return [...this.client.keys()]
      .filter((k) => k.startsWith(prefix))
      .map((k) => this.del(k));
  }
}
