import { ClientOptions, Serializable } from "../types";
import Client from "./Client";

type CFReply = {
  keys: { name: string }[];
  list_complete: boolean;
  cursor: string;
};

// Use Cloudflare's KV store
export default class Cloudflare extends Client {
  // It handles expirations natively
  EXPIRES = true as const;

  // Check whether the given store is a FILE-type
  static test = (client: any): boolean =>
    client?.constructor?.name === "KvNamespace" ||
    client?.constructor?.name === "EdgeKVNamespace";

  get = async (key: string): Promise<Serializable> =>
    this.decode(await this.client.get(key));
  set = (
    key: string,
    data: Serializable,
    opts: ClientOptions,
  ): Promise<void> => {
    const expirationTtl = opts.expires ? Math.round(opts.expires) : undefined;
    if (expirationTtl && expirationTtl < 60) {
      throw new Error("Cloudflare's min expiration is '60s'");
    }
    return this.client.put(key, this.encode(data), { expirationTtl });
  };

  del = (key: string): Promise<void> => this.client.delete(key);

  // Since we have pagination, we don't want to get all of the
  // keys at once if we can avoid it
  async *iterate(prefix = ""): AsyncGenerator<[string, Serializable]> {
    let cursor: string | undefined;
    do {
      const raw = (await this.client.list({ prefix, cursor })) as CFReply;
      const keys = raw.keys.map((k) => k.name);
      for (let key of keys) {
        const value = await this.get(key);
        // By the time this value is read it could be gone!
        if (value !== null && value !== undefined) yield [key, value];
      }
      cursor = raw.list_complete ? undefined : raw.cursor;
    } while (cursor);
  }

  keys = async (prefix = ""): Promise<string[]> => {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const raw = (await this.client.list({ prefix, cursor })) as CFReply;
      keys.push(...raw.keys.map((k) => k.name));
      cursor = raw.list_complete ? undefined : raw.cursor;
    } while (cursor);
    return keys;
  };

  entries = async (prefix = ""): Promise<[string, Serializable][]> => {
    const keys = await this.keys(prefix);
    const values = await Promise.all(keys.map((k) => this.get(k)));
    return keys.map((k, i) => [k, values[i]]);
  };
}
