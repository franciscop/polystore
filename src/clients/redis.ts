import Client from "./Client";

// Use a redis client to back up the store
export default class Redis extends Client {
  // Indicate if this client handles expirations (true = it does)
  EXPIRES = true as const;

  // Check if this is the right class for the given client
  static test = (client: any): boolean =>
    client && client.pSubscribe && client.sSubscribe;

  get = async (key: string): Promise<any> =>
    this.decode(await this.client.get(key));
  set = async (
    key: string,
    value: any,
    { expires }: { expires?: number | null } = {},
  ): Promise<any> => {
    const EX = expires ? Math.round(expires) : undefined;
    return this.client.set(key, this.encode(value), { EX });
  };
  del = (key: string): Promise<number> => this.client.del(key);

  has = async (key: string): Promise<boolean> =>
    Boolean(await this.client.exists(key));

  // Go through each of the [key, value] in the set
  async *iterate(prefix = ""): AsyncGenerator<[string, any], void, unknown> {
    const MATCH = prefix + "*";
    for await (const key of this.client.scanIterator({ MATCH })) {
      const value = await this.get(key);
      // By the time this specific value is read, it could be gone!
      if (value !== null && value !== undefined) {
        yield [key, value];
      }
    }
  }

  // Optimizing the retrieval of them by not getting their values
  keys = async (prefix = ""): Promise<string[]> => {
    const MATCH = prefix + "*";
    const keys: string[] = [];
    for await (const key of this.client.scanIterator({ MATCH })) {
      keys.push(key);
    }
    return keys;
  };

  // Optimizing the retrieval of them all in bulk by loading the values
  // in parallel
  entries = async (prefix = ""): Promise<[string, any][]> => {
    const keys = await this.keys(prefix);
    const values = await Promise.all(keys.map((k) => this.get(k)));
    return keys.map((k, i) => [k, values[i]]);
  };

  clearAll = (): Promise<string> => this.client.flushAll();
  close = (): Promise<string> => this.client.quit();
}
