export default {
  preset: "ts-jest/presets/default-esm", // ESM + TS
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"], // only TypeScript files
  transform: {
    "^.+\\.ts$": ["ts-jest", { useESM: true }], // transform TS files
  },
  moduleFileExtensions: ["ts", "js", "json"], // standard extensions
};
