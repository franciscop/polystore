import Client from "./Client.js";

// Use localForage for managing the KV
export default class Forage extends Client {
  // Check if this is the right class for the given client
  static test = (client) =>
    client?.defineDriver && client?.dropInstance && client?.INDEXEDDB;

  get = (key) => this.client.getItem(key);
  set = (key, value) => this.client.setItem(key, value);
  del = (key) => this.client.removeItem(key);

  async *iterate(prefix = "") {
    const keys = await this.client.keys();
    const list = keys.filter((k) => k.startsWith(prefix));
    for (const key of list) {
      yield [key, await this.get(key)];
    }
  }

  entries = async (prefix = "") => {
    const all = await this.client.keys();
    const keys = all.filter((k) => k.startsWith(prefix));
    const values = await Promise.all(keys.map((key) => this.get(key)));
    return keys.map((key, i) => [key, values[i]]);
  };

  clearAll = () => this.client.clear();
}
