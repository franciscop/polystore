// tslint:disable:no-unused-variable
import kv from "..";

type Obj = { [key: string]: any };
type Counter = { count: number };
type Names = string[];

const stores = [
  kv(),
  kv().prefix("session:"),
  kv().prefix("session:").prefix("auth:"),
];

(async () => {
  for (const store of stores) {
    const add1: string = await store.add("value");
    const add2: string = await store.add("value", {});
    const add3: string = await store.add("value", { expires: null });
    const add4: string = await store.add("value", { expires: 100 });
    const add5: string = await store.add("value", { expires: "100s" });
    const add6: string = await store.add<string>("value");
    const add7: string = await store.add<Obj>({ hello: "value" });
    const add8: string = await store.add<Counter>({ count: 2 });
    const add9: string = await store.add<Names>(["value"]);

    const set1: string = await store.set("key", "value");
    const set2: string = await store.set("key", "value", {});
    const set3: string = await store.set("key", "value", { expires: null });
    const set4: string = await store.set("key", "value", { expires: 100 });
    const set5: string = await store.set("key", "value", { expires: "100s" });
    const set6: string = await store.set<string>("key", "value");
    const set7: string = await store.set<Obj>("key", { hello: "value" });
    const set8: string = await store.set<Counter>("key", { count: 2 });
    const set9: string = await store.set<Names>("key", ["value"]);

    const val1 = await store.get("key");
    const val2: string = await store.get<string>("key");
    const val3: Obj = await store.get<Obj>("key");
    const val4: Counter = await store.get<Counter>("key");
    const val5: Names = await store.get<Names>("key");

    const has1: boolean = await store.has("key");
    const del1: string = await store.del("key");

    for await (const [key, value] of store) {
      console.log(key, value);
    }
    for await (const [key, value] of store) {
      console.log(key, value);
    }
    for await (const [key, value] of store.prefix("session:")) {
      console.log(key, value);
    }

    const ent1 = await store.entries();
    const ent2: [string, string][] = await store.entries<string>();
    const ent3: [string, Obj][] = await store.entries<Obj>();
    const ent4: [string, Counter][] = await store.entries<Counter>();
    const ent5: [string, Names][] = await store.entries<Names>();

    // console.log(
    //   add1,
    //   add2,
    //   add3,
    //   add4,
    //   add5,
    //   add6,
    //   add7,
    //   add8,
    //   add9,
    //   set1,
    //   set2,
    //   set3,
    //   set4,
    //   set5,
    //   set6,
    //   set7,
    //   set8,
    //   set9,
    //   val1,
    //   val2,
    //   val3,
    //   val4,
    //   val5,
    //   has1,
    //   del1,
    //   ent1,
    //   ent2,
    //   ent3,
    //   ent4,
    //   ent5
    // );
  }
})();
