// A client that uses a single file (JSON) as a store
export default class File {
  // Check if this is the right class for the given client
  static test(client) {
    if (
      typeof client === "string" &&
      client.startsWith("file:") &&
      client.includes(".")
    )
      return true;
    return (
      client instanceof URL &&
      client.protocol === "file:" &&
      client.pathname.includes(".")
    );
  }

  constructor(file) {
    this.file =
      typeof file === "string" ? file.slice("file://".length) : file.pathname;

    // Run this once on launch; import the FS module and reset the file
    this.promise = (async () => {
      const [fsp, path] = await Promise.all([
        import("node:fs/promises"),
        import("node:path"),
      ]);

      // We want to make sure the file already exists, so attempt to
      // create the folders and the file (but not OVERWRITE it, that's why the x flag)
      // It fails if it already exists, hence the catch case
      await fsp.mkdir(path.dirname(this.file), { recursive: true });
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

  async *iterate(prefix = "") {
    const data = await this.#read();
    const entries = Object.entries(data).filter((p) => p[0].startsWith(prefix));
    for (const entry of entries) {
      yield entry;
    }
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
