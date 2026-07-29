import kv from "../src/index.ts";

// Bug A1: prefix dropped
const map = new Map();
const store = kv(map).prefix("app:");
await store.set("a", 1);
await kv(store).set("b", 2);
console.log("A1 map keys:", [...map.keys()]);

// Bug A2: expires dropped
const store2 = kv(new Map(), { expires: "1h" });
await store2.promise;
const re = kv(store2);
await re.promise;
console.log("A2 EXPIRES:", store2.EXPIRES, "->", re.EXPIRES);

// Bug B: pending inner store
const inner = kv(new Promise((r) => setTimeout(() => r(new Map()), 50)));
try {
  const outer = kv(inner);
  console.log("B get ->", await outer.get("x"));
} catch (e) {
  console.log("B THREW:", e.message);
}

// Bug B variant: prefix substore + options
try {
  const s = kv(kv(new Map()).prefix("app:"), { prefix: "sub:" });
  await s.set("k", 1);
  console.log("B2 ok, keys:", await s.keys());
} catch (e) {
  console.log("B2 THREW:", e.message);
}
