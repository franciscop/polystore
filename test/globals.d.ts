// The tests use describe/it/expect as globals, which `bun test` provides at
// runtime; this types them off bun:test so tsc knows about them too
declare global {
  const describe: typeof import("bun:test")["describe"];
  const it: typeof import("bun:test")["it"];
  const test: typeof import("bun:test")["test"];
  const expect: typeof import("bun:test")["expect"];
  const beforeAll: typeof import("bun:test")["beforeAll"];
  const beforeEach: typeof import("bun:test")["beforeEach"];
  const afterAll: typeof import("bun:test")["afterAll"];
  const afterEach: typeof import("bun:test")["afterEach"];
}

export {};
