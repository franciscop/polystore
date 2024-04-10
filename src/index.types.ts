import kv from "..";

const store = kv();

(async () => {
  await store.get("key");
  await store.set("key", "value");
  await store.set("key", "value", {});
  await store.set("key", "value", { expires: 100 });
  await store.set("key", "value", { expires: "100s" });
  const key1: string = await store.add("value");
  const key2: string = await store.add("value", { expires: 100 });
  const key3: string = await store.add("value", { expires: "100s" });
  console.log(key1, key2, key3);
  if (await store.has("key")) {
  }
})();
