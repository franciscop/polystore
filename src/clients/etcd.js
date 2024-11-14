// Use a redis client to back up the store
export default class Etcd {
  // Check if this is the right class for the given client
  static test = (client) => client?.constructor?.name === "Etcd3";

  constructor(client) {
    this.client = client;
  }

  get = (key) => this.client.get(key).json();
  set = (key, value) => this.client.put(key).value(JSON.stringify(value));
  del = (key) => this.client.delete().key(key).exec();

  async *iterate(prefix = "") {
    const keys = await this.client.getAll().prefix(prefix).keys();
    for (const key of keys) {
      yield [key, await this.get(key)];
    }
  }

  keys = (prefix = "") => this.client.getAll().prefix(prefix).keys();
  entries = async (prefix = "") => {
    const keys = await this.keys(prefix);
    const values = await Promise.all(keys.map((k) => this.get(k)));
    return keys.map((k, i) => [k, values[i]]);
  };
  clear = async (prefix = "") => {
    if (!prefix) return this.client.delete().all();
    return this.client.delete().prefix(prefix);
  };
}
