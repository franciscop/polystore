import Client from "./Client";

const valueEncoding = "json";
const notFound = (error) => {
  if (error?.code === "LEVEL_NOT_FOUND") return null;
  throw error;
};

// Level KV DB - https://github.com/Level/level
export default class Level extends Client {
  // Check if this is the right class for the given client
  static test = (client) => client?.constructor?.name === "ClassicLevel";

  get = (key) => this.client.get(key, { valueEncoding }).catch(notFound);
  set = (key, value) => this.client.put(key, value, { valueEncoding });
  del = (key) => this.client.del(key);

  async *iterate(prefix = "") {
    const keys = await this.client.keys().all();
    const list = keys.filter((k) => k.startsWith(prefix));
    for (const key of list) {
      yield [key, await this.get(key)];
    }
  }

  entries = async (prefix = "") => {
    const keys = await this.client.keys().all();
    const list = keys.filter((k) => k.startsWith(prefix));
    return Promise.all(list.map(async (k) => [k, await this.get(k)]));
  };

  clearAll = () => this.client.clear();
  clear = async (prefix = "") => {
    const keys = await this.client.keys().all();
    const list = keys.filter((k) => k.startsWith(prefix));
    return this.client.batch(list.map((key) => ({ type: "del", key })));
  };

  close = () => this.client.close();
}
