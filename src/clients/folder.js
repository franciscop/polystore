import Client from "./Client.js";

const noFileOk = (error) => {
  if (error.code === "ENOENT") return null;
  throw error;
};

// A client that uses a single file (JSON) as a store
export default class Folder extends Client {
  // Check if this is the right class for the given client
  static test = (client) => {
    if (client instanceof URL) client = client.href;
    return (
      typeof client === "string" &&
      client.startsWith("file://") &&
      client.endsWith("/")
    );
  };

  // Make sure the folder already exists, so attempt to create it
  // It fails if it already exists, hence the catch case
  #promise = (async () => {
    this.fsp = await import("node:fs/promises");
    this.folder = (this.client?.href || this.client).replace(/^file:\/\//, "");
    await this.fsp.mkdir(this.folder, { recursive: true }).catch(() => {});
  })();

  file = (key) => this.folder + key + ".json";

  get = (key) => {
    return this.fsp
      .readFile(this.file(key), "utf8")
      .then(this.decode, noFileOk);
  };
  set = (key, value) => {
    return this.fsp.writeFile(this.file(key), this.encode(value), "utf8");
  };
  del = (key) => this.fsp.unlink(this.file(key)).catch(noFileOk);

  async *iterate(prefix = "") {
    const all = await this.fsp.readdir(this.folder);
    const keys = all.filter((f) => f.startsWith(prefix) && f.endsWith(".json"));
    for (const name of keys) {
      const key = name.slice(0, -".json".length);
      const data = await this.get(key);
      yield [key, data];
    }
  }
}
