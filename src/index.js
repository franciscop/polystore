const layers = {};

const times = /(-?(?:\d+\.?\d*|\d*\.?\d+)(?:e[-+]?\d+)?)\s*([\p{L}]*)/iu;

parse.millisecond = parse.ms = 1;
parse.second = parse.sec = parse.s = parse[""] = parse.ms * 1000;
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
  return Math.abs(Math.round(result));
}

layers.expire = (store) => {
  // Item methods
  const get = async (key) => {
    if (!(await store.has(key))) return null;
    const { data, expire } = await store.get(key);
    if (expire === null) return data;
    const diff = expire - new Date().getTime();
    if (diff <= 0) return null;
    return data;
  };
  const set = async (key, data, { expire = null } = {}) => {
    const time = parse(expire);
    const expDiff = time !== null ? new Date().getTime() + time : null;
    return store.set(key, { expire: expDiff, data });
  };
  const has = async (key) => (await store.get(key)) !== null;
  const del = store.del;

  // Group methods
  const keys = store.keys;
  const clear = store.clear;

  return { get, set, has, del, keys, clear };
};

layers.memory = (store) => {
  // Item methods
  const get = async (key) => store.get(key) || null;
  const set = async (key, data) => store.set(key, data);
  const has = async (key) => store.has(key);
  const del = async (key) => store.delete(key);

  // Group methods
  const keys = async (prefix = "") =>
    [...(await store.keys())].filter((k) => k.startsWith(prefix));
  const clear = () => store.clear();

  return { get, set, has, del, keys, clear };
};

layers.storage = (store) => {
  // Item methods
  const get = async (key) => (store[key] ? JSON.parse(store[key]) : null);
  const set = async (key, data) => store.setItem(key, JSON.stringify(data));
  const has = async (key) => key in store;
  const del = async (key) => store.removeItem(key);

  // Group methods
  const keys = async (prefix = "") =>
    Object.keys(store).filter((k) => k.startsWith(prefix));
  const clear = () => store.clear();

  return { get, set, has, del, keys, clear };
};

layers.cookie = () => {
  const get = async (key) => {
    const value =
      document.cookie
        .split("; ")
        .filter(Boolean)
        .find((row) => row.startsWith(key + "="))
        ?.split("=")[1] || null;
    return JSON.parse(decodeURIComponent(value));
  };

  const set = async (key, data, { expire = null } = {}) => {
    const time = parse(expire);
    const now = new Date().getTime();
    const expireStr =
      time !== null ? `; expires=${new Date(now + time).toUTCString()}` : "";
    const value = encodeURIComponent(JSON.stringify(data));
    document.cookie = key + "=" + value + expireStr;
  };
  const has = async (key) => (await keys()).includes(key);
  const del = async (key) => set(key, "", { expire: -100 });

  // Group methods
  const keys = async (prefix = "") =>
    document.cookie
      .split(";")
      .map((l) => l.split("=")[0].trim())
      .filter(Boolean)
      .filter((k) => k.startsWith(prefix));
  const clear = async () => {
    await Promise.all((await keys()).map(del));
  };

  return { get, set, has, del, keys, clear };
};

layers.redis = (store) => {
  const get = async (key) => {
    const client = await store;
    const value = await client.get(key);
    if (!value) return null;
    return JSON.parse(value);
  };
  const set = async (key, value, { expire = null } = {}) => {
    if (value === null || expire === 0) return del(key);
    const client = await store;
    const exp = parse(expire);
    const EX = exp ? Math.round(exp / 1000) : undefined;
    return client.set(key, JSON.stringify(value), { EX });
  };
  const has = async (key) => Boolean(await (await store).exists(key));
  const del = async (key) => (await store).del(key);

  const keys = async (prefix = "") => (await store).keys(prefix + "*");
  const clear = async () => (await store).flushAll();
  const close = async () => (await store).quit();

  return { get, set, has, del, keys, clear, close };
};

layers.localForage = (store) => {
  const get = (key) => store.getItem(key);
  const set = (key, value) => store.setItem(key, value);
  const has = async (key) => (await get(key)) !== null;
  const del = (key) => store.removeItem(key);

  const keys = async (prefix = "") =>
    (await store.keys()).filter((k) => k.startsWith(prefix));
  const clear = () => store.clear();

  return { get, set, has, del, keys, clear };
};

layers.cloudflare = (store) => {
  const get = async (key) => {
    const data = await store.get(key);
    if (!data) return null;
    return JSON.parse(data);
  };
  const set = async (key, value, { expire }) => {
    if (value === null || expire === 0) return del(key);
    const client = await store;
    const exp = parse(expire);
    const expirationTtl = exp ? Math.round(exp / 1000) : undefined;
    return client.set(key, JSON.stringify(value), { expirationTtl });
  };
  const has = (key) => Boolean(store.get(key));
  const del = (key) => store.delete(key);
  const keys = (prefix) => store.list({ prefix });
  return { get, set, has, del, keys, clear };
};

layers.file = (file) => {
  const fsProm = (async () => {
    // For the bundler, it doesn't like it otherwise
    const lib = "node:fs/promises";
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
    data[key] = value;
    await setContent(data);
  };
  const has = async (key) => (await get(key)) !== null;
  const del = async (key) => {
    const data = await getContent();
    delete data[key];
    await setContent(data);
  };
  const keys = async (prefix = "") => {
    const data = await getContent();
    return Object.keys(data).filter((k) => k.startsWith(prefix));
  };
  const clear = async () => {
    await setContent({});
  };
  return { get, set, has, del, keys, clear };
};

const getStore = async (store) => {
  // Convert it to the normalized kv, then add the expiry layer on top
  if (store instanceof Map) {
    return layers.expire(layers.memory(store));
  }

  if (typeof localStorage !== "undefined" && store === localStorage) {
    return layers.expire(layers.storage(store));
  }

  if (typeof sessionStorage !== "undefined" && store === sessionStorage) {
    return layers.expire(layers.storage(store));
  }

  if (store === "cookie") {
    return layers.cookie();
  }

  if (store.defineDriver && store.dropInstance && store.INDEXEDDB) {
    return layers.expire(layers.localForage(store));
  }

  if (store.protocol && store.protocol === "file:") {
    return layers.expire(layers.file(store));
  }

  if (store.pSubscribe && store.sSubscribe) {
    return layers.redis(store);
  }

  if (store.constructor && store.constructor.name === "NvNamespace") {
    return layers.cloudflare(store);
  }

  // ¯\_(ツ)_/¯
  return null;
};

export default function compat(storeClient = new Map()) {
  return new Proxy(
    {},
    {
      get: (_, key) => {
        return async (...args) => {
          const store = await getStore(await storeClient);
          // Throw at the first chance when the store failed to init:
          if (!store) {
            throw new Error("Store is not valid");
          }
          // The store.close() is the only one allowed to be called even
          // if it doesn't exist, since it's optional in some stores
          if (!store[key] && key === "close") return null;
          return store[key](...args);
        };
      },
    }
  );
}
