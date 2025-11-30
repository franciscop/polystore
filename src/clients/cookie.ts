import Client from "./Client.js";

// A client that uses a single file (JSON) as a store
export default class Cookie extends Client {
  // Indicate if this client handles expirations (true = it does)
  EXPIRES = true;

  // Check if this is the right class for the given client
  static test = (client: any): boolean =>
    client === "cookie" || client === "cookies";

  // Group methods
  #read = (): Record<string, any> => {
    const all: Record<string, any> = {};
    for (let entry of document.cookie.split(";")) {
      try {
        const [rawKey, rawValue] = entry.split("=");
        const key = decodeURIComponent(rawKey.trim());
        const value = JSON.parse(decodeURIComponent(rawValue.trim()));
        all[key] = value;
      } catch (error) {
        // no-op (some 3rd party can set cookies independently)
      }
    }
    return all;
  };

  // For cookies, an empty value is the same as null, even `""`
  get = (key: string): any => this.#read()[key] || null;

  set = (
    key: string,
    data: any = null,
    { expires }: { expires?: number | null } = {},
  ): void => {
    // Setting it to null deletes it
    let expireStr = "";
    // NOTE: 0 is already considered here!
    if (typeof expires === "number") {
      const time = new Date(Date.now() + expires * 1000).toUTCString();
      expireStr = `; expires=${time}`;
    }

    const value = encodeURIComponent(this.encode(data || ""));
    document.cookie = encodeURIComponent(key) + "=" + value + expireStr;
  };

  del = (key: string): void => this.set(key, "", { expires: -100 });

  async *iterate(prefix = ""): AsyncGenerator<[string, any], void, unknown> {
    for (let [key, value] of Object.entries(this.#read())) {
      if (!key.startsWith(prefix)) continue;
      yield [key, value];
    }
  }
}
