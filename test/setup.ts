import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "bun:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost",
  pretendToBeVisual: true,
});

const window = dom.window;

// Set up global browser environment
(globalThis as any).window = window;
(globalThis as any).document = window.document;
(globalThis as any).localStorage = window.localStorage;
(globalThis as any).sessionStorage = window.sessionStorage;
(globalThis as any).navigator = window.navigator;
(globalThis as any).location = window.location;
(globalThis as any).history = window.history;
(globalThis as any).HTMLElement = window.HTMLElement;
(globalThis as any).Element = window.Element;
(globalThis as any).Node = window.Node;
(globalThis as any).Document = window.Document;
(globalThis as any).Storage = window.Storage;

// Expose Bun test globals
(globalThis as any).describe = describe;
(globalThis as any).it = it;
(globalThis as any).expect = expect;
(globalThis as any).beforeEach = beforeEach;
(globalThis as any).afterAll = afterAll;
(globalThis as any).beforeAll = beforeAll;
(globalThis as any).afterEach = afterEach;
(globalThis as any).jest = jest;
