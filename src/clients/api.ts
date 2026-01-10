import type { ClientOptions, Serializable } from "../types";
import Client from "./Client";

// Handle an API endpoint with fetch()
export default class Api extends Client {
  TYPE = "API";

  // Indicate that the file handler DOES handle expirations
  EXPIRES = true as const;

  static test = (client: string | unknown) =>
    typeof client === "string" && /^https?:\/\//.test(client);

  #api = async <T>(
    key: string,
    opts = "",
    method = "GET",
    body?: string,
  ): Promise<T | null> => {
    const url = `${this.client.replace(/\/$/, "")}/${encodeURIComponent(key)}${opts}`;
    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json",
    };
    const res = await fetch(url, { method, headers, body });
    if (!res.ok) return null;
    return this.decode<T>(await res.text());
  };

  get = <T>(key: string): Promise<T | null> => this.#api<T>(key);
  set = async <T extends Serializable>(
    key: string,
    value: T,
    { expires }: ClientOptions = {},
  ) => {
    const exp = typeof expires === "number" ? `?expires=${expires}` : "";
    await this.#api<T>(key, exp, "PUT", this.encode(value));
  };
  del = (key: string) => this.#api<null>(key, "", "DELETE");

  async *iterate<T>(prefix = ""): AsyncGenerator<[string, T]> {
    const data = await this.#api<Record<string, T>>(
      "",
      `?prefix=${encodeURIComponent(prefix)}`,
    );
    for (let [key, value] of Object.entries(data || {})) {
      if (value !== null) {
        yield [prefix + key, value];
      }
    }
  }
}
