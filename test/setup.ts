import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest, } from "bun:test";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    url: "http://localhost",
    pretendToBeVisual: true,
});
const window = dom.window;
// Set up global browser environment
globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
globalThis.sessionStorage = window.sessionStorage;
globalThis.navigator = window.navigator;
globalThis.location = window.location;
globalThis.history = window.history;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.Document = window.Document;
globalThis.Storage = window.Storage;
// Expose Bun test globals
globalThis.describe = describe;
globalThis.it = it;
globalThis.expect = expect;
globalThis.beforeEach = beforeEach;
globalThis.afterAll = afterAll;
globalThis.beforeAll = beforeAll;
globalThis.afterEach = afterEach;
globalThis.jest = jest;
//# sourceMappingURL=setup.js.map