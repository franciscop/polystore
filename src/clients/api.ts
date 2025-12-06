import type { Options, Serializable } from "../types";
import Client from "./Client";

// Handle an API endpoint with fetch()
export default class Api extends Client {
  // Indicate that the file handler DOES handle expirations
  EXPIRES = true;

  static test = (client: any) =>
    typeof client === "string" && /^https?:\/\//.test(client);

  #api = async (
    key: string,
    opts = "",
    method = "GET",
    body?: string,
  ): Promise<Serializable> => {
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

  get = (key: string): Promise<Serializable> => this.#api(key);
  set = async (key: string, value: Serializable, { expires }: Options = {}) => {
    const expiresStr = `?expires=${expires || ""}`;
    await this.#api(key, expiresStr, "PUT", this.encode(value));
  };
  del = async (key: string) => {
    await this.#api(key, "", "DELETE");
  };

  async *iterate(prefix = ""): AsyncGenerator<[string, Serializable]> {
    const data = await this.#api("", `?prefix=${encodeURIComponent(prefix)}`);
    for (let [key, value] of Object.entries(data || {})) {
      yield [prefix + key, value];
    }
  }
}
