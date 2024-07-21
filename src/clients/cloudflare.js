// Use Cloudflare's KV store
export default class Cloudflare {
  // Indicate that the file handler does NOT handle expirations
  EXPIRES = true;

  // Check whether the given store is a FILE-type
  static test(client) {
    return (
      client?.constructor?.name === "KvNamespace" ||
      client?.constructor?.name === "EdgeKVNamespace"
    );
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
    const expirationTtl = expires ? Math.round(expires) : undefined;
    this.client.put(key, JSON.stringify(value), { expirationTtl });
    return key;
  }

  async del(key) {
    return this.client.delete(key);
  }

  async keys(prefix = "") {
    const raw = await this.client.list({ prefix });
    return raw.keys.map((k) => k.name);
  }

  async entries(prefix = "") {
    const keys = await this.keys(prefix);
    const values = await Promise.all(keys.map((k) => this.get(k)));
    return keys.map((key, i) => [key, values[i]]);
  }

  async clear(prefix = "") {
    const list = await this.keys(prefix);
    return Promise.all(list.map((k) => this.del(k)));
  }
}
