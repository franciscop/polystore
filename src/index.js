import clients from "./clients/index.js";
import { createId, isClass, parse } from "./utils.js";

class Store {
  PREFIX = "";

  constructor(clientPromise) {
    this.promise = Promise.resolve(clientPromise).then(async (client) => {
      this.client = this.#find(client);
      this.#validate(this.client);
      this.promise = null;
      return client;
    });
  }

  #find(store) {
    // Already a fully compliant KV store
    if (store instanceof Store) return store.client;

    // One of the supported ones, so we receive an instance and
    // wrap it with the client wrapper
    for (let client of Object.values(clients)) {
      if (client.test && client.test(store)) {
        return new client(store);
      }
    }

    // A raw one, we just receive the single instance to use directly
    if (isClass(store)) {
      return new store();
    }
    return store;
  }

  #validate(client) {
    if (!client) throw new Error("No client received");
    if (!client.set || !client.get || !client.iterate) {
      throw new Error("Client should have .get(), .set() and .iterate()");
    }

    if (!client.EXPIRES) {
      for (let method of ["has", "keys", "values"]) {
        if (client[method]) {
          throw new Error(
            `You can only define client.${method}() when the client manages the expiration; otherwise please do NOT define .${method}() and let us manage it`
          );
        }
      }
    }
  }

  #unix(expires) {
    const now = new Date().getTime();
    return expires === null ? null : now + expires * 1000;
  }

  // Check if the given data is fresh or not; if
  #isFresh(data, key) {
    // Should never happen, but COULD happen; schedule it for
    // removal and mark it as stale
    if (!data || !data.value || typeof data !== "object") {
      if (key) this.del(key);
      return false;
    }

    // It never expires, so keep it
    if (data.expires === null) return true;

    // It's fresh, keep it
    if (data.expires > Date.now()) return true;

    // It's expired, remove it
    if (key) this.del(key);
    return false;
  }

  async add(value, options = {}) {
    await this.promise;
    const expires = parse(options.expire ?? options.expires);

    // Use the underlying one from the client if found
    if (this.client.add) {
      if (this.client.EXPIRES) {
        return this.client.add(this.PREFIX, value, { expires });
      }

      // In the data we need the timestamp since we need it "absolute":
      return this.client.add(this.PREFIX, {
        expires: this.#unix(expires),
        value,
      });
    }

    const id = createId();
    await this.set(id, value, { expires });
    return id; // The plain one without the prefix
  }

  async set(key, value, options = {}) {
    await this.promise;
    const id = this.PREFIX + key;
    const expires = parse(options.expire ?? options.expires);

    // Quick delete
    if (value === null || (typeof expires === "number" && expires <= 0)) {
      await this.del(id);
      return key;
    }

    // The client manages the expiration, so let it manage it
    if (this.client.EXPIRES) {
      await this.client.set(id, value, { expires });
      return key;
    }

    // In the data we need the timestamp since we need it "absolute":
    await this.client.set(id, { expires: this.#unix(expires), value });
    return key;
  }

  async get(key) {
    await this.promise;
    const id = this.PREFIX + key;

    const data = (await this.client.get(id)) ?? null;

    // No value; nothing to do/check
    if (data === null) return null;

    // The client already managed expiration and there's STILL some data,
    // so we can assume it's the raw user data
    if (this.client.EXPIRES) return data;

    if (!this.#isFresh(data, key)) return null;
    return data.value;
  }

  async has(key) {
    await this.promise;
    const id = this.PREFIX + key;

    if (this.client.has) {
      return this.client.has(id);
    }

    const value = await this.get(key);
    return value !== null;
  }

  async del(key) {
    await this.promise;
    const id = this.PREFIX + key;

    if (this.client.del) {
      await this.client.del(id);
      return key;
    }

    await this.client.set(id, null, { expires: 0 });
    return key;
  }

  async *[Symbol.asyncIterator]() {
    await this.promise;

    for await (const [name, data] of this.client.iterate(this.PREFIX)) {
      const key = name.slice(this.PREFIX.length);
      if (this.client.EXPIRES) {
        yield [key, data];
      } else if (this.#isFresh(data, key)) {
        yield [key, data.value];
      }
    }
  }

  async entries() {
    await this.promise;

    // Cut the key to size
    const trim = (key) => key.slice(this.PREFIX.length);

    let list = [];
    if (this.client.entries) {
      const entries = await this.client.entries(this.PREFIX);
      list = entries.map(([key, value]) => [trim(key), value]);
    } else {
      for await (const [key, value] of this.client.iterate(this.PREFIX)) {
        list.push([trim(key), value]);
      }
    }

    // The client already manages the expiration, so we can assume
    // that at this point, all entries are not-expired
    if (this.client.EXPIRES) return list;

    // We need to do manual expiration checking
    return list
      .filter(([key, data]) => this.#isFresh(data, key))
      .map(([key, data]) => [key, data.value]);
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

  async values() {
    await this.promise;

    if (this.client.values) {
      const list = this.client.values(this.PREFIX);
      if (this.client.EXPIRES) return list;
      return list
        .filter((data) => this.#isFresh(data))
        .map((data) => data.value);
    }

    const entries = await this.entries();
    return entries.map((e) => e[1]);
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
    await Promise.all(keys.map((key) => this.del(key)));
  }

  prefix(prefix = "") {
    const store = new Store(
      Promise.resolve(this.promise).then((client) => client || this.client)
    );
    store.PREFIX = this.PREFIX + prefix;
    return store;
  }

  async close() {
    await this.promise;

    if (this.client.close) {
      return this.client.close();
    }
  }
}

export default (client) => new Store(client);
