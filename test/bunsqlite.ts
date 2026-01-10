export default (async () => {
  if (typeof globalThis.Bun !== "undefined") {
    const { Database } = await import("bun:sqlite");
    return new Database(":memory:");
  }
  const { default: Database } = (await import("better-sqlite3")) as any;
  return new Database(":memory:");
})();
