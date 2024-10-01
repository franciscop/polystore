const noFileOk = (error) => {
  if (error.code === "ENOENT") return null;
  throw error;
};

// A client that uses a single file (JSON) as a store
export default class Folder {
  // Check if this is the right class for the given client
  static test(client) {
    if (
      typeof client === "string" &&
      client.startsWith("file:") &&
      client.endsWith("/")
    )
      return true;
    return (
      client instanceof URL &&
      client.protocol === "file:" &&
      client.pathname.endsWith("/")
    );
  }

  constructor(folder) {
    this.folder =
      typeof folder === "string"
        ? folder.slice("file://".length).replace(/\/$/, "") + "/"
        : folder.pathname.replace(/\/$/, "") + "/";

    // Run this once on launch; import the FS module and reset the file
    this.promise = (async () => {
      const fsp = await import("node:fs/promises");

      // Make sure the folder already exists, so attempt to create it
      // It fails if it already exists, hence the catch case
      await fsp.mkdir(this.folder, { recursive: true }).catch((err) => {});
      return fsp;
    })();
  }

  async get(key) {
    const fsp = await this.promise;
    const file = this.folder + key + ".json";
    const text = await fsp.readFile(file, "utf8").catch(noFileOk);
    if (!text) return null;
    return JSON.parse(text);
  }

  async set(key, value) {
    const fsp = await this.promise;
    const file = this.folder + key + ".json";
    await fsp.writeFile(file, JSON.stringify(value, null, 2), "utf8");
    return file;
  }

  async del(key) {
    const file = this.folder + key + ".json";
    const fsp = await this.promise;
    await fsp.unlink(file).catch(noFileOk);
    return file;
  }

  async *iterate(prefix = "") {
    const fsp = await this.promise;
    const all = await fsp.readdir(this.folder);
    const keys = all
      .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
      .map((name) => name.slice(0, -".json".length));
    for (const key of keys) {
      const data = await this.get(key);
      yield [key, data];
    }
  }

  // async clear(prefix = "") {
  //   const data = await this.#read();
  //   for (let key in data) {
  //     if (key.startsWith(prefix)) {
  //       delete data[key];
  //     }
  //   }
  //   await this.#write(data);
  // }
}
