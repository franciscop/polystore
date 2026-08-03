import kv from "../src/index";

const delay = (t: number): Promise<void> =>
  new Promise((done) => setTimeout(done, t));

// The simplest possible adapter: just a getter and a setter, like backends
// that cannot list their keys (e.g. memcached). All of the single-key methods
// work; the group methods throw a clear error.
const createMinimal = () => {
  const data: Record<string, any> = {};
  return {
    TYPE: "MINIMAL",
    get: (key: string) => data[key] ?? null,
    set: (key: string, value: any) => {
      if (value === null) {
        delete data[key];
      } else {
        data[key] = value;
      }
    },
  };
};

describe("get/set-only adapters", () => {
  it("is a valid store", async () => {
    const store = kv(createMinimal());
    await store.promise;
    expect(store.type).toBe("MINIMAL");
  });

  it("supports the single-key methods", async () => {
    const store = kv(createMinimal());
    expect(await store.get("a")).toBe(null);
    await store.set("a", "b");
    expect(await store.get("a")).toBe("b");
    expect(await store.has("a")).toBe(true);
    await store.del("a");
    expect(await store.get("a")).toBe(null);
    const id = await store.add({ hello: "world" });
    expect(await store.get(id)).toEqual({ hello: "world" });
  });

  it("supports expiration", async () => {
    const store = kv(createMinimal());
    await store.set("a", "b", { expires: "10ms" });
    expect(await store.get("a")).toBe("b");
    await delay(20);
    expect(await store.get("a")).toBe(null);
  });

  it("supports prefixes for the single-key methods", async () => {
    const minimal = createMinimal();
    const store = kv(minimal);
    await store.prefix("app:").set("a", "b");
    expect(await store.prefix("app:").get("a")).toBe("b");
    expect(await store.get("app:a")).toBe("b");
  });

  it("throws a clear error on the group methods", async () => {
    const store = kv(createMinimal());
    const error = /does not support \.iterate\(\)/;
    await expect(store.keys()).rejects.toThrow(error);
    await expect(store.values()).rejects.toThrow(error);
    await expect(store.entries()).rejects.toThrow(error);
    await expect(store.all()).rejects.toThrow(error);
    await expect(store.clear()).rejects.toThrow(error);
    await expect(
      (async () => {
        for await (const entry of store) entry;
      })(),
    ).rejects.toThrow(error);
  });

  it("still uses the native group methods when iterate is missing", async () => {
    const data: Record<string, any> = {};
    const store = kv({
      TYPE: "MINIMALCLEAR",
      get: (key: string) => data[key] ?? null,
      set: (key: string, value: any) => {
        if (value === null) {
          delete data[key];
        } else {
          data[key] = value;
        }
      },
      clear: (prefix: string) => {
        for (const key of Object.keys(data)) {
          if (key.startsWith(prefix)) delete data[key];
        }
      },
    });
    await store.set("a", "b");
    await store.clear();
    expect(await store.get("a")).toBe(null);
  });
});
