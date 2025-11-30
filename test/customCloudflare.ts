const {
  CLOUDFLARE_ACCOUNT,
  CLOUDFLARE_NAMESPACE,
  CLOUDFLARE_EMAIL,
  CLOUDFLARE_API_KEY,
} = process.env;

const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT}/storage/kv/namespaces/${CLOUDFLARE_NAMESPACE}`;
const headers = {
  "X-Auth-Email": CLOUDFLARE_EMAIL || "",
  "X-Auth-Key": CLOUDFLARE_API_KEY || "",
};

export default class CustomCloudflare {
  EXPIRES = true;

  async get(key: string): Promise<any> {
    const res = await fetch(`${baseUrl}/values/${key}`, { headers });
    if (res.status === 404) return null; // It does not exist
    const data = await (res.headers.get("content-type")?.includes("json")
      ? res.json()
      : res.text());
    if (!data) return null;
    return JSON.parse(data);
  }

  async set(
    key: string,
    body: any,
    { expires }: { expires?: number | null },
  ): Promise<string> {
    const expiration = expires ? `expiration_ttl=${expires}&` : "";
    const res = await fetch(`${baseUrl}/values/${key}?${expiration}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("NOT OK", await res.text());
      throw new Error("NOT OK");
    }
    return key;
  }

  async del(key: string): Promise<void> {
    const res = await fetch(`${baseUrl}/values/${key}`, {
      method: "DELETE",
      headers,
    });
    if (!res.ok) {
      console.error("NOT OK", await res.text());
      throw new Error("NOT OK");
    }
  }

  async keys(prefix: string): Promise<string[]> {
    const res = await fetch(`${baseUrl}/keys`, { headers });
    if (!res.ok) {
      console.error("NOT OK", await res.text());
      throw new Error("NOT OK");
    }
    const data = await res.json();
    return data.result
      .map((it: any) => it.name)
      .filter((key: string) => key.startsWith(prefix));
  }

  async *iterate(prefix: string): AsyncGenerator<[string, any], void, unknown> {
    const keys = await this.keys(prefix);

    // A list of promises. Requests them all in parallel, but will start
    // yielding them as soon as they are available (in order)
    const pairs = keys.map(
      async (key) => [key, await this.get(key)] as [string, any],
    );
    for (let prom of pairs) {
      const pair = await prom;
      // Some values could have been nullified from reading of the keys to
      // reading of the value
      if (!pair[1]) continue;
      yield pair;
    }
  }
}
