import Client from "./Client.js";

const valueEncoding = "json";
const notFound = (error: any): null => {
  if (error?.code === "LEVEL_NOT_FOUND") return null;
  throw error;
};

// Level KV DB - https://github.com/Level/level
export default class Level extends Client {
  // Check if this is the right class for the given client
  static test = (client: any): boolean => client?.constructor?.name === "ClassicLevel";

  get = (key: string): Promise<any> => this.client.get(key, { valueEncoding }).catch(notFound);
  set = (key: string, value: any): Promise<void> => this.client.put(key, value, { valueEncoding });
  del = (key: string): Promise<void> => this.client.del(key);

  async *iterate(prefix = ""): AsyncGenerator<[string, any], void, unknown> {
    const keys: string[] = await this.client.keys().all();
    const list = keys.filter((k) => k.startsWith(prefix));
    for (const key of list) {
      yield [key, await this.get(key)];
    }
  }

  entries = async (prefix = ""): Promise<[string, any][]> => {
    const keys: string[] = await this.client.keys().all();
    const list = keys.filter((k) => k.startsWith(prefix));
    return Promise.all(list.map(async (k) => [k, await this.get(k)] as [string, any]));
  };

  clearAll = (): Promise<void> => this.client.clear();
  clear = async (prefix = ""): Promise<void> => {
    const keys: string[] = await this.client.keys().all();
    const list = keys.filter((k) => k.startsWith(prefix));
    return this.client.batch(list.map((key) => ({ type: "del" as const, key })));
  };

  close = (): Promise<void> => this.client.close();
}
