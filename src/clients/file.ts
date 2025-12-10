import type { promises as FsPromises } from "node:fs";
import { StoreData } from "../types";
import Client from "./Client";

// A client that uses a single file (JSON) as a store
export default class File extends Client {
  fsp!: typeof FsPromises;
  file: string = "";
  #lock: Promise<void> = Promise.resolve();

  // Check if this is the right class for the given client
  static test = (client: string | unknown): boolean => {
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
  promise = (async () => {
    this.fsp = (await import(
      "node:fs/promises"
    )) as unknown as typeof FsPromises;
    this.file = (this.client?.href || this.client).replace(/^file:\/\//, "");
    const folder = this.file.split("/").slice(0, -1).join("/");
    await this.fsp.mkdir(folder, { recursive: true }).catch(() => {});
    await this.fsp.writeFile(this.file, "{}", { flag: "wx" }).catch(() => {});
  })();

  // Internal - acquire lock before operations
  #withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    const previousLock = this.#lock;
    let releaseLock: () => void;
    this.#lock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    try {
      await previousLock;
      return await fn();
    } finally {
      releaseLock!();
    }
  };

  #read = async (): Promise<Record<string, StoreData>> => {
    try {
      const text = await this.fsp.readFile(this.file, "utf8");
      return text ? JSON.parse(text) : {};
    } catch (error: any) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  };

  #write = async (data: Record<string, StoreData>): Promise<void> => {
    return this.fsp.writeFile(this.file, this.encode(data));
  };

  get = async (key: string): Promise<StoreData> => {
    return this.#withLock(async () => {
      const data = await this.#read();
      return data[key] ?? null;
    });
  };

  set = async (key: string, value: StoreData): Promise<void> => {
    return this.#withLock(async () => {
      const data = await this.#read();
      if (value === null) {
        delete data[key];
      } else {
        data[key] = value;
      }
      await this.#write(data);
    });
  };

  async *iterate(
    prefix = "",
  ): AsyncGenerator<[string, StoreData], void, unknown> {
    const data = await this.#read();
    const entries = Object.entries(data).filter((p) => p[0].startsWith(prefix));
    for (const entry of entries) {
      yield entry as [string, StoreData];
    }
  }

  // Bulk updates are worth creating a custom method here
  clearAll = (): Promise<void> => this.#withLock(() => this.#write({}));
  clear = async (prefix = ""): Promise<void> => {
    return this.#withLock(async () => {
      const data = await this.#read();
      for (let key in data) {
        if (key.startsWith(prefix)) {
          delete data[key];
        }
      }
      await this.#write(data);
    });
  };
}
