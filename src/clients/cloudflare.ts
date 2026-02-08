import { ClientOptions, Serializable } from "../types";
import Client from "./Client";

type CFReply = {
  keys: { name: string }[];
  list_complete: boolean;
  cursor: string;
};

// Use Cloudflare's KV store
export default class Cloudflare extends Client {
  TYPE = "CLOUDFLARE";

  // It handles expirations natively
  EXPIRES = true as const;

  static testKeys = ["getWithMetadata", "get", "list", "delete"];

  get = async <T extends Serializable>(key: string): Promise<T | null> => {
    const value = await this.client.get(key);
    return this.decode<T>(value);
  };

  set = async <T extends Serializable>(
    key: string,
    data: T,
    expires: ClientOptions,
  ): Promise<void> => {
    const expirationTtl = expires ? Math.round(expires) : undefined;
    if (expirationTtl && expirationTtl < 60) {
      throw new Error("Cloudflare's min expiration is '60s'");
    }
    await this.client.put(key, this.encode(data), { expirationTtl });
  };

  del = (key: string): Promise<void> => this.client.delete(key);

  // Since we have pagination, we don't want to get all of the
  // keys at once if we can avoid it
  async *iterate<T extends Serializable>(
    prefix = "",
  ): AsyncGenerator<[string, T]> {
    let cursor: string | undefined;
    do {
      const raw = (await this.client.list({ prefix, cursor })) as CFReply;
      const keys = raw.keys.map((k) => k.name);
      for (let key of keys) {
        const value = await this.get<T>(key);
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

  entries = async <T extends Serializable>(
    prefix = "",
  ): Promise<[string, T][]> => {
    const keys = await this.keys(prefix);
    const values = await Promise.all(keys.map((k) => this.get<T>(k)));
    return keys.map((k, i) => [k, values[i]]).filter((p) => p[1] !== null) as [
      string,
      T,
    ][];
  };
}
