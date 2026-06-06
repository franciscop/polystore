import betterAuthStorage, { PolystoreBetterAuthStorage } from "./index.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("betterAuthStorage", () => {
  it("returns a PolystoreBetterAuthStorage instance", () => {
    expect(betterAuthStorage()).toBeInstanceOf(PolystoreBetterAuthStorage);
  });

  it("accepts a custom store", () => {
    expect(betterAuthStorage(new Map())).toBeInstanceOf(PolystoreBetterAuthStorage);
  });

  it("get returns null for missing key", async () => {
    const s = betterAuthStorage();
    expect(await s.get("missing")).toBe(null);
  });

  it("set and get a string value", async () => {
    const s = betterAuthStorage();
    await s.set("key", "value");
    expect(await s.get("key")).toBe("value");
  });

  it("set and get a JSON string", async () => {
    const s = betterAuthStorage();
    const json = JSON.stringify({ userId: "123", token: "abc" });
    await s.set("session", json);
    expect(await s.get("session")).toBe(json);
  });

  it("delete removes a key", async () => {
    const s = betterAuthStorage();
    await s.set("key", "value");
    await s.delete("key");
    expect(await s.get("key")).toBe(null);
  });

  it("delete is a no-op for missing keys", async () => {
    const s = betterAuthStorage();
    await expect(s.delete("missing")).resolves.toBeUndefined();
  });

  it("set with ttl expires the key", async () => {
    const s = betterAuthStorage();
    await s.set("key", "value", 0.05); // 50ms
    expect(await s.get("key")).toBe("value");
    await delay(80);
    expect(await s.get("key")).toBe(null);
  });

  it("set without ttl does not expire", async () => {
    const s = betterAuthStorage();
    await s.set("key", "value");
    await delay(50);
    expect(await s.get("key")).toBe("value");
  });

  it("prefix scopes keys", async () => {
    const s = betterAuthStorage();
    const scoped = s.prefix("session:");
    await scoped.set("abc", "data");
    expect(await scoped.get("abc")).toBe("data");
    expect(await s.get("abc")).toBe(null);
    expect(await s.get("session:abc")).toBe("data");
  });
});
