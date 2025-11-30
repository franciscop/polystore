import Client from "./Client.js";

// Handle an API endpoint with fetch()
export default class Api extends Client {
  // Indicate that the file handler DOES handle expirations
  EXPIRES = true;

  static test = (client: any): boolean =>
    typeof client === "string" && /^https?:\/\//.test(client);

  #api = async (key: string, opts = "", method = "GET", body?: string): Promise<any> => {
    const url = `${this.client.replace(/\/$/, "")}/${encodeURIComponent(key)}${opts}`;
    const headers: Record<string, string> = { accept: "application/json" };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(url, { method, headers, body });
    if (!res.ok) return null;
    if (res.headers.get("content-type")?.includes("application/json")) {
      return res.json();
    }
    return res.text();
  };

  get = (key: string): Promise<any> => this.#api(key);
  set = (key: string, value: any, { expires }: { expires?: number | null } = {}): Promise<any> =>
    this.#api(key, `?expires=${expires || ""}`, "PUT", this.encode(value));
  del = (key: string): Promise<any> => this.#api(key, "", "DELETE");

  async *iterate(prefix = ""): AsyncGenerator<[string, any], void, unknown> {
    const data = await this.#api("", `?prefix=${encodeURIComponent(prefix)}`);
    for (let [key, value] of Object.entries(data || {})) {
      yield [prefix + key, value];
    }
  }
}
