export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { useESM: true }],
  },
  moduleFileExtensions: ["ts", "js", "json"],
  ci: true,
  // Only crawl the test dir. Without this, Jest scans the whole repo and picks
  // up service data dirs (e.g. etcd's `default.etcd/member/snap/*.snap`),
  // wrongly reporting them as obsolete Jest snapshots.
  roots: ["<rootDir>/test"],
  modulePathIgnorePatterns: ["<rootDir>/default.etcd/"],
};
