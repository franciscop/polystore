const layers = {};

const times = /(-?(?:\d+\.?\d*|\d*\.?\d+)(?:e[-+]?\d+)?)\s*([\p{L}]*)/iu;

parse.millisecond = parse.ms = 0.001;
parse.second = parse.sec = parse.s = parse[""] = 1;
parse.minute = parse.min = parse.m = parse.s * 60;
parse.hour = parse.hr = parse.h = parse.m * 60;
parse.day = parse.d = parse.h * 24;
parse.week = parse.wk = parse.w = parse.d * 7;
parse.year = parse.yr = parse.y = parse.d * 365.25;
parse.month = parse.b = parse.y / 12;

// Returns the time in milliseconds
function parse(str) {
  if (str === null || str === undefined) return null;
  if (typeof str === "number") return str;
  // ignore commas/placeholders
  str = str.toLowerCase().replace(/[,_]/g, "");
  let [_, value, units] = times.exec(str) || [];
  if (!units) return null;
  const unitValue = parse[units] || parse[units.replace(/s$/, "")];
  if (!unitValue) return null;
  const result = unitValue * parseFloat(value, 10);
  return Math.abs(Math.round(result * 1000) / 1000);
}

// "nanoid" imported manually
// Something about improved GZIP performance with this string
const urlAlphabet =
  "useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict";

export let random = (bytes) => crypto.getRandomValues(new Uint8Array(bytes));

function generateId() {
  let size = 24;
  let id = "";
  let bytes = crypto.getRandomValues(new Uint8Array(size));
  while (size--) {
    // Using the bitwise AND operator to "cap" the value of
    // the random byte from 255 to 63, in that way we can make sure
    // that the value will be a valid index for the "chars" string.
    id += urlAlphabet[bytes[size] & 61];
  }
  return id;
}

layers.extra = (store) => {
  const add = async (value, options) => store.set(generateId(), value, options);
  const has = async (key) => (await store.get(key)) !== null;
  const del = async (key) => store.set(key, null);
  const keys = async (prefix = "") => {
    const all = await store.entries(prefix);
    return all.map((p) => p[0]);
  };
  const values = async (prefix = "") => {
    const all = await store.entries(prefix);
    return all.map((p) => p[1]);
  };
  return { add, has, del, keys, values, ...store };
};

// Adds an expiration layer to those stores that don't have it;
// it's not perfect since it's not deleted until it's read, but
// hey it's better than nothing
layers.expire = (store) => {
  // Item methods
  const get = async (key) => {
    const data = await store.get(key);
    if (!data) return null;
    const { value, expire } = data;
    // It never expires
    if (expire === null) return value;
    const diff = expire - new Date().getTime();
    if (diff <= 0) return null;
    return value;
  };
  const set = async (key, value, { expire, expires } = {}) => {
    const time = parse(expire || expires);
    // Already expired, or do _not_ save it, then delete it
    if (value === null || time === 0) return store.set(key, null);
    const expDiff = time !== null ? new Date().getTime() + time * 1000 : null;
    return store.set(key, { expire: expDiff, value });
  };

  // Group methods
  const entries = async (prefix = "") => {
    const all = await store.entries(prefix);
    const now = new Date().getTime();
    return all
      .filter(([, data]) => {
        // There's no data, so remove this
        if (!data || data === null) return false;

        // It never expires, so keep it
        const { expire } = data;
        if (expire === null) return true;

        // It's expired, so remove it
        if (expire - now <= 0) return false;

        // It's not expired, keep it
        return true;
      })
      .map(([key, data]) => [key, data.value]);
  };

  // We want to force overwrite here!
  return { ...store, get, set, entries };
};

layers.memory = (store) => {
  // Item methods
  const get = async (key) => store.get(key) ?? null;
  const set = async (key, data) => {
    if (data === null) {
      await store.delete(key);
    } else {
      await store.set(key, data);
    }
    return key;
  };

  // Group methods
  const entries = async (prefix = "") => {
    const entries = [...store.entries()];
    return entries.filter((p) => p[0].startsWith(prefix));
  };
  const clear = () => store.clear();

  return { get, set, entries, clear };
};

layers.storage = (store) => {
  // Item methods
  const get = async (key) => (store[key] ? JSON.parse(store[key]) : null);
  const set = async (key, data) => {
    if (data === null) {
      await store.removeItem(key);
    } else {
      await store.setItem(key, JSON.stringify(data));
    }
    return key;
  };

  // Group methods
  const entries = async (prefix = "") => {
    const entries = Object.entries(store);
    return entries
      .map((p) => [p[0], p[1] ? JSON.parse(p[1]) : null])
      .filter((p) => p[0].startsWith(prefix));
  };
  const clear = () => store.clear();

  return { get, set, entries, clear };
};

// Cookies auto-expire, so we cannot do expiration checks manually
layers.cookie = () => {
  const getAll = () => {
    const all = {};
    for (let entry of document.cookie
      .split(";")
      .map((k) => k.trim())
      .filter(Boolean)) {
      const [key, data] = entry.split("=");
      try {
        all[key.trim()] = JSON.parse(decodeURIComponent(data.trim()));
      } catch (error) {
        // no-op (some 3rd party can set cookies independently)
      }
    }
    return all;
  };

  const get = async (key) => getAll()[key] ?? null;

  const set = async (key, data, { expire, expires } = {}) => {
    if (data === null) {
      await set(key, "", { expire: -100 });
    } else {
      const time = parse(expire || expires);
      const now = new Date().getTime();
      // NOTE: 0 is already considered here!
      const expireStr =
        time !== null
          ? `; expires=${new Date(now + time * 1000).toUTCString()}`
          : "";
      const value = encodeURIComponent(JSON.stringify(data));
      document.cookie = key + "=" + value + expireStr;
    }
    return key;
  };

  // Group methods
  const entries = async (prefix = "") => {
    const all = Object.entries(getAll());
    return all.filter((p) => p[0].startsWith(prefix));
  };

  const clear = async () => {
    const keys = Object.keys(getAll());
    await Promise.all(keys.map((key) => set(key, null)));
  };

  return { get, set, entries, clear };
};

// Plain 'redis' and not ioredis or similar
layers.redis = (store) => {
  const get = async (key) => {
    const value = await store.get(key);
    if (!value) return null;
    return JSON.parse(value);
  };
  const set = async (key, value, { expire, expires } = {}) => {
    const time = parse(expire || expires);
    if (value === null || time === 0) return del(key);
    const EX = time ? Math.round(time) : undefined;
    await store.set(key, JSON.stringify(value), { EX });
    return key;
  };
  const has = async (key) => Boolean(await store.exists(key));
  const del = async (key) => store.del(key);

  const keys = async (prefix = "") => store.keys(prefix + "*");
  const entries = async (prefix = "") => {
    const keys = await store.keys(prefix + "*");
    const values = await Promise.all(keys.map((k) => get(k)));
    return keys.map((k, i) => [k, values[i]]);
  };
  const clear = async () => store.flushAll();
  const close = async () => store.quit();

  return { get, set, has, del, keys, entries, clear, close };
};

layers.localForage = (store) => {
  const get = async (key) => store.getItem(key);
  const set = async (key, value) => {
    if (value === null) {
      await store.removeItem(key);
    } else {
      await store.setItem(key, value);
    }
    return key;
  };
  const entries = async (prefix = "") => {
    const all = await store.keys();
    const keys = all.filter((k) => k.startsWith(prefix));
    const values = await Promise.all(keys.map((key) => store.getItem(key)));
    return keys.map((key, i) => [key, values[i]]);
  };
  const clear = async () => store.clear();

  return { get, set, entries, clear };
};

layers.cloudflare = (store) => {
  const get = async (key) => {
    const data = await store.get(key);
    if (!data) return null;
    return JSON.parse(data);
  };
  const set = async (key, value, { expire, expires } = {}) => {
    const time = parse(expire || expires);
    if (value === null || time === 0) return del(key);
    const client = await store;
    const expirationTtl = time ? Math.round(time) : undefined;
    client.put(key, JSON.stringify(value), { expirationTtl });
    return key;
  };
  const has = async (key) => Boolean(await store.get(key));
  const del = (key) => store.delete(key);

  // Group methods
  const keys = async (prefix = "") => {
    const raw = await store.list({ prefix });
    return raw.keys;
  };
  const entries = async (prefix = "") => {
    const all = await keys(prefix);
    const values = await Promise.all(all.map((k) => get(k)));
    return all.map((key, i) => [key, values[i]]);
  };
  const clear = () => {};
  return { get, set, has, del, entries, keys, clear };
};

layers.file = (file) => {
  const fsProm = (async () => {
    // For the bundler, it doesn't like it otherwise
    const lib = ["node:fs", "promises"].join("/");
    const fsp = await import(lib);
    // We want to make sure the file already exists, so attempt to
    // create it (but not OVERWRITE it, that's why the x flag) and
    // it fails if it already exists
    await fsp.writeFile(file.pathname, "{}", { flag: "wx" }).catch((err) => {
      if (err.code !== "EEXIST") throw err;
    });
    return fsp;
  })();
  const getContent = async () => {
    const fsp = await fsProm;
    const text = await fsp.readFile(file.pathname, "utf8");
    if (!text) return {};
    return JSON.parse(text);
  };
  const setContent = async (data) => {
    const fsp = await fsProm;
    await fsp.writeFile(file.pathname, JSON.stringify(data, null, 2));
  };
  const get = async (key) => {
    const data = await getContent();
    return data[key] ?? null;
  };
  const set = async (key, value) => {
    const data = await getContent();
    if (value === null) {
      delete data[key];
    } else {
      data[key] = value;
    }
    await setContent(data);
    return key;
  };
  const has = async (key) => (await get(key)) !== null;
  const del = async (key) => set(key, null);

  // Group methods
  const entries = async (prefix = "") => {
    const data = await getContent();
    return Object.entries(data).filter((p) => p[0].startsWith(prefix));
  };
  const clear = async () => {
    await setContent({});
  };
  return { get, set, has, del, entries, clear };
};

const getStore = async (store) => {
  // Convert it to the normalized kv, then add the expiry layer on top
  if (store instanceof Map) {
    return layers.extra(layers.expire(layers.memory(store)));
  }

  if (typeof localStorage !== "undefined" && store === localStorage) {
    return layers.extra(layers.expire(layers.storage(store)));
  }

  if (typeof sessionStorage !== "undefined" && store === sessionStorage) {
    return layers.extra(layers.expire(layers.storage(store)));
  }

  if (store === "cookie") {
    return layers.extra(layers.cookie());
  }

  if (store.defineDriver && store.dropInstance && store.INDEXEDDB) {
    return layers.extra(layers.expire(layers.localForage(store)));
  }

  if (store.protocol && store.protocol === "file:") {
    return layers.extra(layers.expire(layers.file(store)));
  }

  if (store.pSubscribe && store.sSubscribe) {
    return layers.extra(layers.redis(store));
  }

  if (store?.constructor?.name === "KvNamespace") {
    return layers.extra(layers.cloudflare(store));
  }

  // ¯\_(ツ)_/¯
  return null;
};

export default function compat(storeClient = new Map()) {
  return new Proxy(
    {},
    {
      get: (instance, key) => {
        return async (...args) => {
          // Only once, even if called twice in succession, since the
          // second time will go straight to the await
          if (!instance.store && !instance.promise) {
            instance.promise = getStore(await storeClient);
          }
          instance.store = await instance.promise;
          // Throw at the first chance when the store failed to init:
          if (!instance.store) {
            throw new Error("Store is not valid");
          }
          // The store.close() is the only one allowed to be called even
          // if it doesn't exist, since it's optional in some stores
          if (!instance.store[key] && key === "close") return null;
          return instance.store[key](...args);
        };
      },
    }
  );
}
