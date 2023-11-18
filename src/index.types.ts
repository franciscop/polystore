import kv from "..";

const store = kv();

(async () => {
  await store.get("key");
  await store.set("key", "value");
  await store.set("key", "value", {});
  await store.set("key", "value", { expires: 100 });
  await store.set("key", "value", { expires: "100s" });
  if (await store.has("key")) {
  }
})();
