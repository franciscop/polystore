// Use fetch()
export default class Api {
  // Indicate that the file handler does NOT handle expirations
  EXPIRES = true;

  // Check whether the given store is a FILE-type
  static test(client) {
    return (
      typeof client === "string" &&
      (client.startsWith("https://") || client.startsWith("http://"))
    );
  }

  constructor(client) {
    client = client.replace(/\/$/, "") + "/";
    this.client = async (path, opts = {}) => {
      const query = Object.entries(opts.query || {})
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("&");
      let url = client + path.replace(/^\//, "") + "?" + query;
      opts.headers = opts.headers || {};
      opts.headers.accept = "application/json";
      if (opts.body) opts.headers["content-type"] = "application/json";
      const res = await fetch(url, opts);
      if (!res.ok) return null;
      if (!res.headers["content-type"] !== "application/json") {
        console.warn("Not a JSON API");
      }
      return res.json();
    };
  }

  async get(key) {
    return await this.client(`/${key}`);
  }

  async set(key, value, { expires } = {}) {
    return await this.client(`/${encodeURIComponent(key)}`, {
      query: { expires },
      method: "put",
      body: JSON.stringify(value),
    });
  }

  async del(key) {
    return await this.client(`/${encodeURIComponent(key)}`, {
      method: "delete",
    });
  }

  // Since we have pagination, we don't want to get all of the
  // keys at once if we can avoid it
  async *iterate(prefix = "") {
    const data = await this.client("/", { query: { prefix } });
    if (!data) return [];
    for (let [key, value] of Object.entries(data)) {
      yield [prefix + key, value];
    }
  }

  async keys(prefix = "") {
    const data = await this.client(`/`, { query: { prefix } });
    if (!data) return [];
    return Object.keys(data).map((k) => prefix + k);
  }

  async clear(prefix = "") {
    const list = await this.keys(prefix);
    return Promise.all(list.map((k) => this.del(k)));
  }
}
