import Client from "../Client.js";

// A client that uses a single file (JSON) as a store
export default class Redis extends Client {
  // Indicate if this client handles expirations (true = it does)
  EXPIRES = true;

  // Check if this is the right class for the given client
  static test(client) {
    return client && client.pSubscribe && client.sSubscribe;
  }

  async get(key) {
    const value = await this.client.get(key);
    if (!value) return null;
    return JSON.parse(value);
  }

  async set(key, value, { expires } = {}) {
    if (value === null || expires === 0) {
      return this.client.del(key);
    }

    const EX = expires ? Math.round(expires) : undefined;
    await this.client.set(key, JSON.stringify(value), { EX });
    return key;
  }

  async has(key) {
    return Boolean(await this.client.exists(key));
  }

  // Group methods
  async keys(prefix = "") {
    return this.client.keys(prefix + "*");
  }

  async entries(prefix = "") {
    const keys = await this.client.keys(prefix + "*");
    const values = await Promise.all(keys.map((k) => this.get(k)));
    return keys.map((k, i) => [k, values[i]]);
  }

  async clear(prefix = "") {
    if (!prefix) return this.client.flushAll();

    const list = await this.keys(prefix);
    return Promise.all(list.map((k) => this.set(k, null)));
  }

  async close() {
    return this.client.quit();
  }
}
