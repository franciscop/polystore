import type { ClientOptions } from "../types";
import Client from "./Client";

// A client that uses a single file (JSON) as a store
export default class Cookie extends Client {
  TYPE = "COOKIE";

  // It handles expirations natively
  EXPIRES = true as const;

  // Check if this is the right class for the given client
  static test = (client: string | unknown) => {
    return client === "cookie" || client === "cookies";
  };

  // Group methods
  #read = <T>(): Record<string, T> => {
    const all: Record<string, T> = {};
    for (let entry of document.cookie.split(";")) {
      try {
        const [rawKey, rawValue] = entry.split("=");
        const key = decodeURIComponent(rawKey.trim());
        const value = this.decode(decodeURIComponent(rawValue.trim()));
        all[key] = value;
      } catch (error) {
        // no-op; 3rd party can be set cookies independently and shouldn't throw
      }
    }
    return all;
  };

  // For cookies, an empty value is the same as null, even `""`
  get = <T>(key: string): T | null => {
    const all = this.#read<T>();
    return key in all ? all[key] : null;
  };

  set = <T>(key: string, data: T, expires: ClientOptions): void => {
    const k = encodeURIComponent(key);
    const value = encodeURIComponent(this.encode(data ?? ""));

    let exp = "";
    if (typeof expires === "number") {
      const when = expires <= 0 ? 0 : Date.now() + expires * 1000;
      exp = `; expires=${new Date(when).toUTCString()}`;
    }

    document.cookie = `${k}=${value}${exp}`;
  };

  del = (key: string): void => this.set(key, "", -100);

  async *iterate<T>(prefix = ""): AsyncGenerator<[string, T]> {
    for (let [key, value] of Object.entries(this.#read<T>())) {
      if (!key.startsWith(prefix)) continue;
      yield [key, value];
    }
  }
}
