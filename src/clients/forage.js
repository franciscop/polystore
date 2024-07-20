// Use localForage for managing the KV
export default class Forage {
  // Check if this is the right class for the given client
  static test(client) {
    return client.defineDriver && client.dropInstance && client.INDEXEDDB;
  }

  constructor(client) {
    this.client = client;
  }

  async get(key) {
    return this.client.getItem(key);
  }

  async set(key, value) {
    if (value === null) {
      await this.client.removeItem(key);
    } else {
      await this.client.setItem(key, value);
    }
    return key;
  }

  async entries(prefix = "") {
    const all = await this.client.keys();
    const keys = all.filter((k) => k.startsWith(prefix));
    const values = await Promise.all(
      keys.map((key) => this.client.getItem(key))
    );
    return keys.map((key, i) => [key, values[i]]);
  }

  async clear(prefix = "") {
    // Delete the whole dataset
    if (!prefix) return this.client.clear();

    // Delete them in a map
    const list = await this.entries(prefix);
    return Promise.all(list.map((e) => this.set(e[0], null)));
  }
}
