// `bun test` injects these as globals instead of imports. Typing them off the
// `bun:test` module (rather than referencing bun-types, which is only a
// transitive dependency) keeps this working on any install layout. It lives
// under test/ so that the `--dts` build, which only reads src/, never sees it.
declare global {
  const describe: (typeof import("bun:test"))["describe"];
  const it: (typeof import("bun:test"))["it"];
  const test: (typeof import("bun:test"))["test"];
  const expect: (typeof import("bun:test"))["expect"];
  const beforeAll: (typeof import("bun:test"))["beforeAll"];
  const beforeEach: (typeof import("bun:test"))["beforeEach"];
  const afterAll: (typeof import("bun:test"))["afterAll"];
  const afterEach: (typeof import("bun:test"))["afterEach"];
}

export {};
