import type { Options, Serializable } from "../types.js";
import Client from "./Client.js";

// A client that uses a single file (JSON) as a store
export default class Cookie extends Client {
  // Indicate if this client handles expirations (true = it does)
  EXPIRES = true;

  // Check if this is the right class for the given client
  static test = (client: any) => client === "cookie" || client === "cookies";

  // Group methods
  #read = (): Record<string, Serializable> => {
    const all: Record<string, Serializable> = {};
    for (let entry of document.cookie.split(";")) {
      try {
        const [rawKey, rawValue] = entry.split("=");
        const key = decodeURIComponent(rawKey.trim());
        const value = JSON.parse(decodeURIComponent(rawValue.trim()));
        all[key] = value;
      } catch (error) {
        // no-op; 3rd party can be set cookies independently and shouldn't throw
      }
    }
    return all;
  };

  // For cookies, an empty value is the same as null, even `""`
  get = (key: string): Serializable => this.#read()[key] || null;

  set = (key: string, data: Serializable, opts: Options): void => {
    const k = encodeURIComponent(key);
    const value = encodeURIComponent(this.encode(data || ""));
    let expires = "";
    if (typeof opts.expires === "number") {
      const time = new Date(Date.now() + opts.expires * 1000);
      expires = `; expires=${time.toUTCString()}`;
    }
    document.cookie = `${k}=${value}${expires}`;
  };

  del = (key: string): void => this.set(key, "", { expires: -100 });

  async *iterate(prefix = ""): AsyncGenerator<[string, Serializable]> {
    for (let [key, value] of Object.entries(this.#read())) {
      if (!key.startsWith(prefix)) continue;
      yield [key, value];
    }
  }
}
