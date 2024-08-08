// Use a redis client to back up the store
export default class Redis {
  // Indicate if this client handles expirations (true = it does)
  EXPIRES = true;

  // Check if this is the right class for the given client
  static test(client) {
    return client && client.pSubscribe && client.sSubscribe;
  }

  constructor(client) {
    this.client = client;
  }

  async get(key) {
    const value = await this.client.get(key);
    if (!value) return null;
    return JSON.parse(value);
  }

  async set(key, value, { expires } = {}) {
    const EX = expires ? Math.round(expires) : undefined;
    return this.client.set(key, JSON.stringify(value), { EX });
  }

  async del(key) {
    return this.client.del(key);
  }

  async has(key) {
    return Boolean(await this.client.exists(key));
  }

  // Group methods
  async keys(prefix = "") {
    return this.client.keys(prefix + "*");
  }

  // Go through each of the [key, value] in the set
  async *iterate(prefix = "") {
    const MATCH = prefix + "*";
    for await (const key of this.client.scanIterator({ MATCH })) {
      const value = await this.get(key);
      // By the time this specific value is read, it could be gone!
      if (!value) continue;
      yield [key, value];
    }
  }

  // Optimizing the retrieval of them all in bulk by loading the values
  // in parallel
  async entries(prefix = "") {
    const keys = await this.keys(prefix);
    const values = await Promise.all(keys.map((k) => this.get(k)));
    return keys.map((k, i) => [k, values[i]]);
  }

  // Optimizing the retrieval of them by not getting their values
  async keys(prefix = "") {
    const MATCH = prefix + "*";
    const keys = [];
    for await (const key of this.client.scanIterator({ MATCH })) {
      keys.push(key);
    }
    return keys;
  }

  async clear(prefix = "") {
    if (!prefix) return this.client.flushAll();

    const list = await this.keys(prefix);
    return Promise.all(list.map((k) => this.client.del(k)));
  }

  async close() {
    return this.client.quit();
  }
}
