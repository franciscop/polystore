const enc = encodeURIComponent; // Optimization of size

// Handle an API endpoint with fetch()
export default class Api {
  // Indicate that the file handler DOES handle expirations
  EXPIRES = true;

  static test = (client) =>
    typeof client === "string" && /^https?:\/\//.test(client);

  constructor(client) {
    client = client.replace(/\/$/, "");
    this.client = async (path, method = "GET", body) => {
      const url = `${client}/${path.replace(/^\//, "")}`;
      const headers = { accept: "application/json" };
      if (body) headers["content-type"] = "application/json";
      const res = await fetch(url, { method, headers, body });
      return res.ok ? res.json() : null;
    };
  }

  get = (key) => this.client(`/${enc(key)}`);

  set = (key, value, { expires } = {}) =>
    this.client(
      `/${enc(key)}?expires=${enc(expires || "")}`,
      "PUT",
      JSON.stringify(value),
    );

  del = (key) => this.client(`/${enc(key)}`, "DELETE");

  async *iterate(prefix = "") {
    const data = await this.client(`/?prefix=${enc(prefix)}`);
    for (let [key, value] of Object.entries(data || {})) {
      yield [prefix + key, value];
    }
  }
}
