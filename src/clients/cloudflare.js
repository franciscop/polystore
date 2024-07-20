// Use Cloudflare's KV store
export default class Cloudflare {
  // Indicate that the file handler does NOT handle expirations
  EXPIRES = true;

  // Check whether the given store is a FILE-type
  static test(store) {
    return store?.constructor?.name === "KvNamespace";
  }

  constructor(client) {
    this.client = client;
  }

  async get(key) {
    const data = await this.client.get(key);
    if (!data) return null;
    return JSON.parse(data);
  }

  async set(key, value, { expires } = {}) {
    if (value === null || expires === 0) return del(key);
    const expirationTtl = expires ? Math.round(expires) : undefined;
    this.client.put(key, JSON.stringify(value), { expirationTtl });
    return key;
  }

  async del(key) {
    return this.client.delete(key);
  }

  async keys(prefix = "") {
    const raw = await this.client.list({ prefix });
    return raw.keys;
  }

  async entries(prefix = "") {
    const keys = await this.keys(prefix);
    const values = await Promise.all(keys.map((k) => get(k)));
    return keys.map((key, i) => [key, values[i]]);
  }

  async clear(prefix = "") {
    const list = await this.keys(prefix);
    return Promise.all(list.map(del));
  }
}
