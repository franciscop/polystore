import type { Store } from "../src/";
import kv from "../src/";

type Obj = { [key: string]: any };
type Counter = { count: number };
type Names = string[];

const stores: Store[] = [
  kv(),
  kv().prefix("session:"),
  kv().prefix("session:").prefix("auth:"),
  kv<boolean>(),
  kv<number>(),
  kv<string>(),
  kv<Record<string, string>>(),
  kv<Array<string>>(),
];

const store1 = kv<string>();
store1.set("a", "10");
// @ts-expect-error
store1.set("a", 10);
const store2 = kv<number>();
store2.set("a", 10);
// @ts-expect-error
store2.set("a", "10");

const store3 = kv<Record<string, number>>();
store3.set("a", { a: 10 });
// @ts-expect-error
store3.set("a", "10");
// @ts-expect-error
store3.set("a", { a: "b" });

// Subclasses work as expected
kv<string | number>().get<string>("a");
// @ts-expect-error
kv<string>().get<number>("a");

for (const store of stores) {
  const add1: string = await store.add("value");
  const add2: string = await store.add("value", undefined);
  const add3: string = await store.add("value", null);
  const add4: string = await store.add("value", 100);
  const add5: string = await store.add("value", "100s");
  const add6: string = await store.add<string>("value");
  const add7: string = await store.add<Obj>({ hello: "value" });
  const add8: string = await store.add<Counter>({ count: 2 });
  const add9: string = await store.add<Names>(["value"]);

  const set1: string = await store.set("key", "value");
  const set2: string = await store.set("key", "value", undefined);
  const set3: string = await store.set("key", "value", null);
  const set4: string = await store.set("key", "value", 100);
  const set5: string = await store.set("key", "value", "100s");
  const set6: string = await store.set<string>("key", "value");
  const set7: string = await store.set<Obj>("key", { hello: "value" });
  const set8: string = await store.set<Counter>("key", { count: 2 });
  const set9: string = await store.set<Names>("key", ["value"]);

  const get1 = await store.get("key");
  const get2: any = await store.get("key");
  const get3: string | null = await store.get<string>("key");
  const get4: Obj | null = await store.get<Obj>("key");
  const get5: Counter | null = await store.get<Counter>("key");
  const get6: Names | null = await store.get<Names>("key");

  const has1: boolean = await store.has("key");
  const del1: string = await store.del("key");

  for await (const [key, value] of store) {
    console.log(key, value);
  }
  for await (const [key, value] of store.prefix("session:")) {
    console.log(key, value);
  }

  // These 2 don't return `null` as values (those are skipped)
  const ent1 = await store.entries();
  const ent2: [string, any][] = await store.entries();
  const ent3: [string, string][] = await store.entries<string>();
  const ent4: [string, Obj][] = await store.entries<Obj>();
  const ent5: [string, Counter][] = await store.entries<Counter>();
  const ent6: [string, Names][] = await store.entries<Names>();

  const val1 = await store.values();
  const val2: any[] = await store.values();
  const val3: string[] = await store.values<string>();
  const val4: Obj[] = await store.values<Obj>();
  const val5: Counter[] = await store.values<Counter>();
  const val6: Names[] = await store.values<Names>();

  console.log(add1, add2, add3, add4, add5, add6, add7, add8, add9);
  console.log(set1, set2, set3, set4, set5, set6, set7, set8, set9);
  console.log(get1, get2, get3, get4, get5, get6);
  console.log(has1, del1);
  console.log(ent1, ent2, ent3, ent4, ent5, ent6);
  console.log(val1, val2, val3, val4, val5, val6);
}
