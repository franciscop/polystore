import clients from "./clients/index.js";
import { createId, parse } from "./utils.js";

function isClass(func) {
  return (
    typeof func === "function" &&
    /^class\s/.test(Function.prototype.toString.call(func))
  );
}

const getClient = (store) => {
  // Already a fully compliant KV store
  if (store instanceof Store) return store.client;

  for (let client of Object.values(clients)) {
    if (client.test && client.test(store)) {
      if (isClass(client)) {
        return new client(store);
      } else {
        return client(store);
      }
    }
  }

  // A raw one
  return store;
};

class Store {
  PREFIX = "";

  constructor(clientPromise = new Map()) {
    this.promise = Promise.resolve(clientPromise).then((client) => {
      this.client = getClient(client);
      this.promise = null;
      return client;
    });
  }

  async add(data, options = {}) {
    await this.promise;
    const expires = parse(options.expire ?? options.expires);

    // Use the underlying one from the client if found
    if (this.client.add) {
      return this.client.add(this.PREFIX, data, { expires });
    }

    const id = createId();
    await this.set(id, data, { expires });
    return id; // The plain one without the prefix
  }

  async set(id, data, options = {}) {
    await this.promise;
    const key = this.PREFIX + id;
    const expires = parse(options.expire ?? options.expires);

    // Quick delete
    if (data === null) {
      await this.client.set(key, null);
      return id;
    }

    // The client manages the expiration, so let it manage it
    if (this.client.EXPIRES) {
      await this.client.set(key, data, { expires });
      return id;
    }

    // Already expired, then delete it
    if (expires === 0) {
      await this.del(id);
      return id;
    }

    // In the data we need the timestamp since we need it "absolute":
    const now = new Date().getTime();
    const expDiff = expires === null ? null : now + expires * 1000;
    await this.client.set(key, { expires: expDiff, value: data });
    return id;
  }

  /**
   * Read a single value from the KV store:
   *
   * ```js
   * const key = await store.set("key1", "value1");
   * const value = await store.get("key1");
   * // "value1"
   * ```
   *
   * **[→ Full .get() Docs](https://polystore.dev/documentation#get)**
   * @param {(string)} key
   * @returns {(any)} value
   */
  async get(key) {
    await this.promise;
    const id = this.PREFIX + key;

    const data = (await this.client.get(id)) ?? null;

    // No value; nothing to do/check
    if (data === null) return null;

    // The client already managed expiration and there's STILL some data,
    // so we can assume it's the raw user data
    if (this.client.EXPIRES) return data;

    // Make sure that if there's no data by now, empty is returned
    if (!data) return null;

    // We manage expiration manually, so we know it should have this structure
    // TODO: ADD A CHECK HERE
    const { expires, value } = data;

    // It never expires
    if (expires === null) return value ?? null;

    // Already expired! Return nothing, and remove the whole key
    if (expires <= new Date().getTime()) {
      await this.del(key);
      return null;
    }

    return value;
  }

  async has(id) {
    await this.promise;
    const key = this.PREFIX + id;

    const value = await this.get(key);
    return value !== null;
  }

  async del(id) {
    await this.promise;
    const key = this.PREFIX + id;

    if (this.client.del) {
      await this.client.del(key);
      return id;
    }

    await this.client.set(key, null, { expires: 0 });
    return id;
  }

  async entries() {
    await this.promise;

    const entries = await this.client.entries(this.PREFIX);
    const list = entries.map(([key, data]) => [
      key.slice(this.PREFIX.length),
      data,
    ]);

    // The client already manages the expiration, so we can assume
    // that at this point, all entries are not-expired
    if (this.client.EXPIRES) return list;

    // We need to do manual expiration checking
    const now = new Date().getTime();
    return list
      .filter(([, data]) => {
        // There's no data, so remove this
        if (!data || data === null || data.value === null) return false;

        // It never expires, so keep it
        const { expire } = data;
        if (expire === null) return true;

        // It's expired, so remove it
        if (expire <= now) return false;

        // It's not expired, keep it
        return true;
      })
      .map(([key, data]) => [key, data.value]);
  }

  async values() {
    await this.promise;

    if (this.client.values) {
      return this.client.values(this.PREFIX);
    }

    const entries = await this.entries();
    return entries.map((e) => e[1]);
  }

  async keys() {
    await this.promise;

    if (this.client.keys) {
      const list = await this.client.keys(this.PREFIX);
      if (!this.PREFIX) return list;
      return list.map((k) => k.slice(this.PREFIX.length));
    }

    const entries = await this.entries();
    return entries.map((e) => e[0]);
  }

  async all() {
    await this.promise;

    if (this.client.all) {
      const obj = await this.client.all(this.PREFIX);
      if (!this.PREFIX) return obj;
      const all = {};
      for (let key in obj) {
        all[key.slice(this.PREFIX.length)] = obj[key];
      }
      return all;
    }

    const entries = await this.entries();
    return Object.fromEntries(entries);
  }

  async clear() {
    await this.promise;

    if (this.client.clear) {
      return this.client.clear(this.PREFIX);
    }

    const keys = await this.keys();
    // Note: this gives trouble of concurrent deletes in the FS
    return await Promise.all(keys.map((key) => this.del(key)));
  }

  prefix(prefix = "") {
    const store = new Store(
      Promise.resolve(this.promise).then((client) => client || this.client)
    );
    store.PREFIX = this.PREFIX + prefix;
    return store;
  }

  async close() {
    if (this.client.close) {
      return this.client.close();
    }
  }
}

export default kv = (client) => new Store(client);
