import Client from "./Client.js";

// Use a Map() as an in-memory client
export default class Memory extends Client {
  // Check if this is the right class for the given client
  static test = (client) => client instanceof Map;

  get = (key) => this.client.get(key) ?? null;
  set = (key, data) => this.client.set(key, data);
  del = (key) => this.client.delete(key);

  *iterate(prefix = "") {
    for (const entry of this.client.entries()) {
      if (entry[0].startsWith(prefix)) yield entry;
    }
  }

  clearAll = () => this.client.clear();
}
