import Client from "./Client.js";

// A client that uses a single file (JSON) as a store
export default class File extends Client {
  // Check if this is the right class for the given client
  static test = (client) => {
    if (client instanceof URL) client = client.href;
    return (
      typeof client === "string" &&
      client.startsWith("file://") &&
      client.includes(".")
    );
  };

  // We want to make sure the file already exists, so attempt to
  // create the folders and the file (but not OVERWRITE it, that's why the x flag)
  // It fails if it already exists, hence the catch case
  #promise = (async () => {
    this.fsp = await import("node:fs/promises");
    this.file = (this.client?.href || this.client).replace(/^file:\/\//, "");
    const folder = this.file.split("/").slice(0, -1).join("/");
    await this.fsp.mkdir(folder, { recursive: true }).catch(() => {});
    await this.fsp.writeFile(this.file, "{}", { flag: "wx" }).catch(() => {});
  })();

  // Internal
  #read = async () => {
    const text = await this.fsp.readFile(this.file, "utf8");
    return text ? JSON.parse(text) : {};
  };

  #write = async (data) => {
    return this.fsp.writeFile(this.file, this.encode(data));
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
  };

  async *iterate(prefix = "") {
    const data = await this.#read();
    const entries = Object.entries(data).filter((p) => p[0].startsWith(prefix));
    for (const entry of entries) {
      yield entry;
    }
  }

  // Bulk updates are worth creating a custom method here
  clearAll = () => this.#write({});
  clear = async (prefix = "") => {
    const data = await this.#read();
    for (let key in data) {
      if (key.startsWith(prefix)) {
        delete data[key];
      }
    }
    await this.#write(data);
  };
}
