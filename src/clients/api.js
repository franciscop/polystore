import Client from "./Client";

// Handle an API endpoint with fetch()
export default class Api extends Client {
  // Indicate that the file handler DOES handle expirations
  EXPIRES = true;

  static test = (client) =>
    typeof client === "string" && /^https?:\/\//.test(client);

  #api = async (key, opts = "", method = "GET", body) => {
    const url = `${this.client.replace(/\/$/, "")}/${encodeURIComponent(key)}${opts}`;
    const headers = { accept: "application/json" };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(url, { method, headers, body });
    return res.ok ? res.json() : null;
  };

  get = (key) => this.#api(key);
  set = (key, value, { expires } = {}) =>
    this.#api(key, `?expires=${expires || ""}`, "PUT", this.encode(value));
  del = (key) => this.#api(key, "", "DELETE");

  async *iterate(prefix = "") {
    const data = await this.#api("", `?prefix=${encodeURIComponent(prefix)}`);
    for (let [key, value] of Object.entries(data || {})) {
      yield [prefix + key, value];
    }
  }
}
