import File from "../src/adapters/file";
import Folder from "../src/adapters/folder";
import kv from "../src/index";

// The File and Folder adapters load `node:fs/promises` asynchronously, so the
// store has to stay pending until that is done. Draining a few microtasks lands
// on the window where the store used to report itself as ready while its
// adapter was still half-built, which crashed the first operation with
// "undefined is not an object (evaluating 'this.fsp.readFile')".
const drain = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe("adapter initialization", () => {
  it("does not throw globally when the init fails but the store is unused", async () => {
    const failing = {
      TYPE: "FAILINIT",
      promise: Promise.reject(new Error("cannot connect")),
      get: () => null,
      set: () => {},
    };
    const store = kv(failing);
    expect(store.type).toBe("FAILINIT");
    // The rejection surfaces on use, not as an unhandled rejection
    await expect(store.get("a")).rejects.toThrow("cannot connect");
  });

  it("does not use the folder adapter before it is ready", async () => {
    const store = kv(`file://${process.cwd()}/data/init-folder/`);
    await drain();
    await store.promise; // The guard that every public method awaits
    expect(store.type).toBe("FOLDER");
    expect((store.adapter as unknown as Folder).folder).toBeTruthy();
    expect(await store.get("missing")).toBe(null);
    await store.set("hello", "world");
    expect(await store.get("hello")).toBe("world");
    await store.clear();
  });

  it("does not use the file adapter before it is ready", async () => {
    const store = kv(`file://${process.cwd()}/data/init-file.json`);
    await drain();
    await store.promise; // The guard that every public method awaits
    expect(store.type).toBe("FILE");
    expect((store.adapter as unknown as File).file).toBeTruthy();
    expect(await store.get("missing")).toBe(null);
    await store.set("hello", "world");
    expect(await store.get("hello")).toBe("world");
    await store.clear();
  });
});
