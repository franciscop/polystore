// Level KV DB - https://github.com/Level/level
export default class Level {
  // Check if this is the right class for the given client
  static test(client) {
    return client?.constructor?.name === "ClassicLevel";
  }

  constructor(client) {
    this.client = client;
  }

  async get(key) {
    try {
      return await this.client.get(key, { valueEncoding: "json" });
    } catch (error) {
      if (error?.code === "LEVEL_NOT_FOUND") return null;
      throw error;
    }
  }

  async set(key, value) {
    return this.client.put(key, value, { valueEncoding: "json" });
  }

  async del(key) {
    return this.client.del(key);
  }

  async *iterate(prefix = "") {
    const keys = await this.client.keys().all();
    const list = keys.filter((k) => k.startsWith(prefix));
    for (const key of list) {
      yield [key, await this.get(key)];
    }
  }

  async entries(prefix = "") {
    const keys = await this.client.keys().all();
    const list = keys.filter((k) => k.startsWith(prefix));
    return Promise.all(list.map(async (k) => [k, await this.get(k)]));
  }

  async clear(prefix = "") {
    if (!prefix) return this.client.clear();
    const keys = await this.client.keys().all();
    const list = keys.filter((k) => k.startsWith(prefix));
    return this.client.batch(list.map((key) => ({ type: "del", key })));
  }

  async close() {
    return await this.client.close();
  }
}
