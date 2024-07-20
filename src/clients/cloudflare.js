import Client from "../Client.js";

// Use Cloudflare's KV store
export default class Cloudflare extends Client {
  // Indicate that the file handler does NOT handle expirations
  EXPIRES = true;

  // Check whether the given store is a FILE-type
  static test(store) {
    return store?.constructor?.name === "KvNamespace";
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

  async has(key) {
    return Boolean(await this.client.get(key));
  }

  async del(key) {
    return this.client.delete(key);
  }

  async keys(prefix = "") {
    const raw = await this.client.list({ prefix });
    return raw.keys;
  }

  async entries(prefix = "") {
    const all = await this.keys(prefix);
    const values = await Promise.all(all.map((k) => get(k)));
    return all.map((key, i) => [key, values[i]]);
  }

  async clear(prefix = "") {
    const list = await this.keys(prefix);
    return Promise.all(list.map(del));
  }
}
