import type { promises as FsPromises } from "node:fs";
import { Serializable, StoreData } from "../types";
import Adapter from "./Adapter";

const noFileOk = (error: any): null => {
  if (error.code === "ENOENT") return null;
  throw error;
};

// A client that uses a single file (JSON) as a store
export default class Folder extends Adapter {
  TYPE = "FOLDER";
  // It desn't handle expirations natively
  HAS_EXPIRATION = false as const;

  fsp!: typeof FsPromises;
  folder!: string;

  // Check if this is the right class for the given client
  static test = (raw: any): boolean => {
    if (raw instanceof URL) raw = raw.href;
    return (
      typeof raw === "string" &&
      raw.startsWith("file://") &&
      raw.endsWith("/")
    );
  };

  // Make sure the folder already exists, so attempt to create it
  // It fails if it already exists, hence the catch case
  connect = async () => {
    this.fsp = (await import(
      "node:fs/promises"
    )) as unknown as typeof FsPromises;
    this.folder = (this.lib?.href || this.lib).replace(/^file:\/\//, "");
    await this.fsp.mkdir(this.folder, { recursive: true }).catch(() => {});
  };

  // Encode the key so it's always a valid filename (e.g. a "cache:" prefix
  // would otherwise produce a colon, which Windows rejects in filenames)
  file = (key: string): string =>
    this.folder + encodeURIComponent(key).replace(/\*/g, "%2A") + ".json";

  get = async <T extends Serializable>(
    key: string,
  ): Promise<StoreData<T> | null> => {
    const file = await this.fsp
      .readFile(this.file(key), "utf8")
      .catch(noFileOk);
    return this.decode<StoreData<T>>(file);
  };

  set = async <T extends Serializable>(
    key: string,
    value: StoreData<T>,
  ): Promise<void> => {
    await this.fsp.writeFile(this.file(key), this.encode(value), "utf8");
  };

  del = async (key: string): Promise<void | null> => {
    await this.fsp.unlink(this.file(key)).catch(noFileOk);
  };

  async *iterate<T extends Serializable>(
    prefix = "",
  ): AsyncGenerator<[string, StoreData<T>], void, unknown> {
    const all = await this.fsp.readdir(this.folder);
    for (const name of all) {
      if (!name.endsWith(".json")) continue;
      const key = decodeURIComponent(name.slice(0, -".json".length));
      if (!key.startsWith(prefix)) continue;
      try {
        const data = await this.get<T>(key);
        if (data !== null && data !== undefined) yield [key, data];
      } catch {
        continue; // skip unreadable files
      }
    }
  }
}
