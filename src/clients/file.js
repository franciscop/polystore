import Client from "../Client.js";

// A client that uses a single file (JSON) as a store
export default class File extends Client {
  // Indicate if this client handles expirations (true = it does)
  EXPIRES = false;

  // Check if this is the right class for the given client
  static test(client) {
    if (typeof client === "string" && client.startsWith("file:")) return true;
    return client instanceof URL && client.protocol === "file:";
  }

  constructor(file) {
    super(file);
    this.file =
      typeof file === "string" ? file.slice("file://".length) : file.pathname;

    // Run this once on launch; import the FS module and reset the file
    this.promise = (async () => {
      const fsp = await import("node:fs/promises");

      // We want to make sure the file already exists, so attempt to
      // create it (but not OVERWRITE it, that's why the x flag) and
      // it fails if it already exists
      await fsp.writeFile(this.file, "{}", { flag: "wx" }).catch((err) => {
        if (err.code !== "EEXIST") throw err;
      });
      return fsp;
    })();
  }

  // Internal
  async #read() {
    const fsp = await this.promise;
    const text = await fsp.readFile(this.file, "utf8");
    if (!text) return {};
    return JSON.parse(text);
  }

  async #write(data) {
    const fsp = await this.promise;
    await fsp.writeFile(this.file, JSON.stringify(data, null, 2));
  }

  async get(key) {
    const data = await this.#read();
    return data[key] ?? null;
  }

  async set(key, value) {
    const data = await this.#read();
    if (value === null) {
      delete data[key];
    } else {
      data[key] = value;
    }
    await this.#write(data);
    return key;
  }

  async has(key) {
    return (await this.get(key)) !== null;
  }

  async del(key) {
    return this.set(key, null);
  }

  // Group methods
  async entries(prefix = "") {
    const data = await this.#read();
    return Object.entries(data).filter((p) => p[0].startsWith(prefix));
  }

  async clear(prefix = "") {
    if (!prefix) {
      return this.#write({});
    }

    const data = await this.#read();
    for (let key in data) {
      if (key.startsWith(prefix)) {
        delete data[key];
      }
    }
    await this.#write(data);
  }
}
