const json = (data) => JSON.stringify(data, null, 2);

// A client that uses a single file (JSON) as a store
export default class Folder {
  // Check if this is the right class for the given client
  static test = (client) => {
    if (client instanceof URL) client = client.href;
    return (
      typeof client === "string" &&
      client.startsWith("file://") &&
      client.endsWith("/")
    );
  };

  constructor(folder) {
    if (folder instanceof URL) folder = folder.href;
    folder = folder.replace(/^file:\/\//, "");

    // Run this once on launch; import the FS module and reset the file
    const prom = import("node:fs/promises").then((fsp) => {
      // Make sure the folder already exists, so attempt to create it
      // It fails if it already exists, hence the catch case
      return fsp.mkdir(folder, { recursive: true }).then(
        () => fsp,
        () => {},
      );
    });

    const getter = (_, name) => {
      return async (key, ...props) => {
        const file = folder + (key ? key + ".json" : "");
        const method = (await prom)[name];
        return method(file, ...props).catch((error) => {
          if (error.code === "ENOENT") return null;
          throw error;
        });
      };
    };

    this.fs = new Proxy({}, { get: getter });
  }

  get = async (key) => {
    const text = await this.fs.readFile(key, "utf8");
    return text ? JSON.parse(text) : null;
  };
  set = (key, value) => this.fs.writeFile(key, json(value), "utf8");
  del = (key) => this.fs.unlink(key);

  async *iterate(prefix = "") {
    const all = await this.fs.readdir();
    const keys = all
      .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
      .map((name) => name.slice(0, -".json".length));
    for (const key of keys) {
      const data = await this.get(key);
      yield [key, data];
    }
  }
}
