import Client from "./Client";

// Use a redis client to back up the store
export default class Redis extends Client {
  // Indicate if this client handles expirations (true = it does)
  EXPIRES = true;

  // Check if this is the right class for the given client
  static test = (client) => client && client.pSubscribe && client.sSubscribe;

  get = async (key) => this.decode(await this.client.get(key));
  set = async (key, value, { expires } = {}) => {
    const EX = expires ? Math.round(expires) : undefined;
    return this.client.set(key, this.encode(value), { EX });
  };
  del = (key) => this.client.del(key);

  has = async (key) => Boolean(await this.client.exists(key));

  // Go through each of the [key, value] in the set
  async *iterate(prefix = "") {
    const MATCH = prefix + "*";
    for await (const key of this.client.scanIterator({ MATCH })) {
      const value = await this.get(key);
      // By the time this specific value is read, it could be gone!
      if (!value) continue;
      yield [key, value];
    }
  }

  // Optimizing the retrieval of them by not getting their values
  keys = async (prefix = "") => {
    const MATCH = prefix + "*";
    const keys = [];
    for await (const key of this.client.scanIterator({ MATCH })) {
      keys.push(key);
    }
    return keys;
  };

  // Optimizing the retrieval of them all in bulk by loading the values
  // in parallel
  entries = async (prefix = "") => {
    const keys = await this.keys(prefix);
    const values = await Promise.all(keys.map((k) => this.get(k)));
    return keys.map((k, i) => [k, values[i]]);
  };

  clearAll = () => this.client.flushAll();
  close = () => this.client.quit();
}
