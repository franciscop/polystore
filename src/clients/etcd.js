// Use a redis client to back up the store
export default class Etcd {
  // Check if this is the right class for the given client
  static test(client) {
    return client?.constructor?.name === "Etcd3";
  }

  constructor(client) {
    this.client = client;
  }

  async get(key) {
    return this.client.get(key).json();
  }

  async set(key, value) {
    if (value === null) {
      return this.client.delete().key(key).exec();
    }

    await this.client.put(key).value(JSON.stringify(value));
  }

  async *iterate(prefix = "") {
    const keys = await this.client.getAll().prefix(prefix).keys();
    for (const key of keys) {
      yield [key, await this.get(key)];
    }
  }

  async entries(prefix = "") {
    const keys = await this.client.getAll().prefix(prefix).keys();
    const values = await Promise.all(keys.map((k) => this.get(k)));
    return keys.map((k, i) => [k, values[i]]);
  }

  async clear(prefix = "") {
    if (!prefix) return this.client.delete().all();

    return this.client.delete().prefix(prefix);
  }

  async close() {
    // return this.client.close();
  }
}
