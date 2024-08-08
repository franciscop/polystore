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
    return this.client.put(key, JSON.stringify(value), { expirationTtl });
  }

  async del(key) {
    return this.client.delete(key);
  }

  // Since we have pagination, we don't want to get all of the
  // keys at once if we can avoid it
  async *iterate(prefix = "") {
    let cursor;
    do {
      const raw = await this.client.list({ prefix, cursor });
      const keys = raw.keys.map((k) => k.name);
      for (let key of keys) {
        const value = await this.get(key);
        // By the time this specific value is read, it could be gone!
        if (!value) continue;
        yield [key, value];
      }
      cursor = raw.list_complete ? null : raw.cursor;
    } while (cursor);
  }

  async keys(prefix = "") {
    const keys = [];
    let cursor;
    do {
      const raw = await this.client.list({ prefix, cursor });
      keys.push(...raw.keys.map((k) => k.name));
      cursor = raw.list_complete ? null : raw.cursor;
    } while (cursor);
    return keys;
  }

  async entries(prefix = "") {
    const keys = await this.keys(prefix);
    const values = await Promise.all(keys.map((k) => this.get(k)));
    return keys.map((k, i) => [k, values[i]]);
  }

  async clear(prefix = "") {
    const list = await this.keys(prefix);
    return Promise.all(list.map((k) => this.del(k)));
  }
}
