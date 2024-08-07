import * as util from "util";

// ref: https://jestjs.io/docs/manual-mocks#mocking-methods-which-are-not-implemented-in-jsdom
// ref: https://github.com/jsdom/jsdom/issues/2524
if (typeof TextEncoder === "undefined") {
  Object.defineProperty(window, "TextEncoder", {
    writable: true,
    value: util.TextEncoder,
  });
}
if (typeof TextDecoder === "undefined") {
  Object.defineProperty(window, "TextDecoder", {
    writable: true,
    value: util.TextDecoder,
  });
}

if (typeof setImmediate === "undefined") {
  Object.defineProperty(window, "setImmediate", {
    writable: true,
    value: (cb) => setTimeout(cb, 0),
  });
}
