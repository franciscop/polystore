import { createId, parse, unix } from "../src/utils";

// The expiration parser covers the same ground as the `ms` library, with two
// deliberate differences: it returns SECONDS (not milliseconds), and it
// returns `null` for anything it cannot read instead of throwing. The cases
// below are ms's own test corpus, converted with that in mind, plus the
// polystore-only units. Divergences are marked and asserted as they behave
// today, so that any change to them is a visible change to this file.

describe("parse: units", () => {
  it("milliseconds", () => {
    expect(parse("100ms")).toBe(0.1);
    expect(parse("100 ms")).toBe(0.1);
    expect(parse("53 milliseconds")).toBe(0.053);
    expect(parse("1millisecond")).toBe(0.001);
    expect(parse(".5ms")).toBe(0.001); // 0.0005 rounded to 3 decimals
  });

  it("seconds", () => {
    expect(parse("1s")).toBe(1);
    expect(parse("10 seconds")).toBe(10);
    expect(parse("1 second")).toBe(1);
    expect(parse("5secs")).toBe(5);
    expect(parse("5 sec")).toBe(5);
  });

  it("minutes", () => {
    expect(parse("1m")).toBe(60);
    expect(parse("2 minutes")).toBe(120);
    expect(parse("1 minute")).toBe(60);
    expect(parse("3mins")).toBe(180);
    expect(parse("3 min")).toBe(180);
  });

  it("hours", () => {
    expect(parse("1h")).toBe(3600);
    expect(parse("2 hours")).toBe(7200);
    expect(parse("1 hour")).toBe(3600);
    expect(parse("2hrs")).toBe(7200);
    expect(parse("2 hr")).toBe(7200);
  });

  it("days", () => {
    expect(parse("1d")).toBe(86400);
    expect(parse("2 days")).toBe(172800);
    expect(parse("1 day")).toBe(86400);
  });

  it("weeks", () => {
    expect(parse("1w")).toBe(604800);
    expect(parse("3 weeks")).toBe(1814400);
    expect(parse("1 week")).toBe(604800);
    expect(parse("2wk")).toBe(1209600); // polystore only
  });

  it("years, at 365.25 days like ms", () => {
    expect(parse("1y")).toBe(31557600);
    expect(parse("2 years")).toBe(63115200);
    expect(parse("1 year")).toBe(31557600);
    expect(parse("1yrs")).toBe(31557600);
    expect(parse("1 yr")).toBe(31557600);
  });

  it("months, which ms does not support", () => {
    expect(parse("1month")).toBe(2629800); // a year / 12
    expect(parse("2 months")).toBe(5259600);
    expect(parse("1b")).toBe(2629800);
  });

  it("is case insensitive", () => {
    expect(parse("1.5H")).toBe(5400);
    expect(parse("1 DAY")).toBe(86400);
    expect(parse("2 Minutes")).toBe(120);
  });

  it("accepts decimals and extra whitespace", () => {
    expect(parse("1.5h")).toBe(5400);
    expect(parse("1.5m")).toBe(90);
    expect(parse("1   s")).toBe(1);
  });

  it("ignores thousand separators", () => {
    expect(parse("1,000s")).toBe(1000); // polystore only
    expect(parse("1_000s")).toBe(1000); // polystore only
  });
});

describe("parse: non-string input", () => {
  it("passes numbers through as seconds", () => {
    expect(parse(100)).toBe(100);
    expect(parse(0)).toBe(0);
    expect(parse(1.5)).toBe(1.5);
  });

  it("returns null for null and undefined", () => {
    expect(parse(null)).toBe(null);
    expect(parse(undefined)).toBe(null);
  });
});

describe("parse: invalid input returns null instead of throwing", () => {
  it("rejects an empty string", () => {
    expect(parse("")).toBe(null);
  });

  it("rejects unknown units", () => {
    expect(parse("5 potatoes")).toBe(null);
    expect(parse("10 lightyears")).toBe(null);
  });

  it("rejects non numeric junk", () => {
    expect(parse("☃")).toBe(null);
    expect(parse("10-.5")).toBe(null);
    expect(parse("hello")).toBe(null);
  });
});

describe("parse: matching ms", () => {
  it("reads a bare number as seconds", () => {
    expect(parse("100")).toBe(100);
    expect(parse("1e3")).toBe(1000); // exponents work too
  });

  it("supports msec and msecs, like ms", () => {
    expect(parse("1msec")).toBe(0.001);
    expect(parse("10msecs")).toBe(0.01);
  });

  it("keeps the sign, so a negative expiration deletes", () => {
    expect(parse("-100ms")).toBe(-0.1);
    expect(parse("-1.5h")).toBe(-5400);
    expect(parse(-100)).toBe(-100); // same as the number form
  });

  it("is anchored, so junk around the value is rejected", () => {
    expect(parse("about 5m ago")).toBe(null);
    expect(parse("10-.5")).toBe(null);
    expect(parse(" 1s ")).toBe(1); // but surrounding whitespace is trimmed
  });
});

describe("parse: remaining differences from ms", () => {
  it("DIFFERS: NaN and Infinity pass through, ms throws", () => {
    expect(parse(NaN)).toBe(NaN);
    expect(parse(Infinity)).toBe(Infinity);
  });

  it("DIFFERS: results are rounded to 3 decimals", () => {
    expect(parse("0.0001ms")).toBe(0); // ms gives 0.0000001
  });
});

describe("createId", () => {
  it("is 24 url-safe alphanumeric characters", () => {
    const id = createId();
    expect(id.length).toBe(24);
    expect(id).toMatch(/^[a-zA-Z0-9]{24}$/);
  });

  it("does not repeat", () => {
    const ids = new Set(Array.from({ length: 500 }, () => createId()));
    expect(ids.size).toBe(500);
  });
});

describe("unix", () => {
  it("turns seconds into an absolute timestamp", () => {
    const before = Date.now();
    const result = unix(10)!;
    expect(result).toBeGreaterThanOrEqual(before + 10000);
    expect(result).toBeLessThanOrEqual(Date.now() + 10000);
  });

  it("keeps null as null, meaning no expiration", () => {
    expect(unix(null)).toBe(null);
  });
});
