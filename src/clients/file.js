// A client that uses a single file (JSON) as a store
export default class File {
  // Check if this is the right class for the given client
  static test(client) {
    if (client instanceof URL) client = client.href;
    return (
      typeof client === "string" &&
      client.startsWith("file://") &&
      client.includes(".")
    );
  }

  constructor(file) {
    if (file instanceof URL) file = file.href;
    this.file = file.replace(/^file:\/\//, "");

    // Run this once on launch; import the FS module and reset the file
    this.promise = (async () => {
      // We want to make sure the file already exists, so attempt to
      // create the folders and the file (but not OVERWRITE it, that's why the x flag)
      // It fails if it already exists, hence the catch case
      const fsp = await import("node:fs/promises");
      const folder = this.file.split("/").slice(0, -1).join("/");
      await fsp.mkdir(folder, { recursive: true }).catch(() => {});
      await fsp.writeFile(this.file, "{}", { flag: "wx" }).catch((err) => {
        if (err.code !== "EEXIST") throw err;
      });
      return fsp;
    })();
  }

  // Internal
  #read = async () => {
    const fsp = await this.promise;
    const data = await fsp.readFile(this.file, "utf8");
    return JSON.parse(data || "{}");
  };

  #write = async (data) => {
    const fsp = await this.promise;
    fsp.writeFile(this.file, JSON.stringify(data, null, 2));
  };

  get = async (key) => {
    const data = await this.#read();
    return data[key] ?? null;
  };

  set = async (key, value) => {
    const data = await this.#read();
    if (value === null) {
      delete data[key];
    } else {
      data[key] = value;
    }
    await this.#write(data);
    return key;
  };

  async *iterate(prefix = "") {
    const data = await this.#read();
    const entries = Object.entries(data).filter((p) => p[0].startsWith(prefix));
    for (const entry of entries) {
      yield entry;
    }
  }

  // Bulk updates are worth creating a custom method here
  clear = async (prefix = "") => {
    if (!prefix) return this.#write({});

    const data = await this.#read();
    for (let key in data) {
      if (key.startsWith(prefix)) {
        delete data[key];
      }
    }
    await this.#write(data);
  };
}
