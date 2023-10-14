import kv from "..";

const store = kv();

(async () => {
  const val = await store.get("key");
  await store.set("key", "value");
  await store.set("key", "value", {});
  await store.set("key", "value", { expire: 100 });
  await store.set("key", "value", { expire: "100s" });
  if (await store.has("key")) {
  }
})();
