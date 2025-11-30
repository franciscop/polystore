const times = /(-?(?:\d+\.?\d*|\d*\.?\d+)(?:e[-+]?\d+)?)\s*([\p{L}]*)/iu;

interface ParseFunction {
  (str: string | number | null | undefined): number | null;
  millisecond: number;
  ms: number;
  second: number;
  sec: number;
  s: number;
  "": number;
  minute: number;
  min: number;
  m: number;
  hour: number;
  hr: number;
  h: number;
  day: number;
  d: number;
  week: number;
  wk: number;
  w: number;
  year: number;
  yr: number;
  y: number;
  month: number;
  b: number;
  [key: string]: number | ((str: string | number | null | undefined) => number | null);
}

const parse = function(str: string | number | null | undefined): number | null {
  if (str === null || str === undefined) return null;
  if (typeof str === "number") return str;
  // ignore commas/placeholders
  const cleaned = str.toLowerCase().replace(/[,_]/g, "");
  let [_, value, units] = times.exec(cleaned) || [];
  if (!units) return null;
  const unitValue = (parse as any)[units] || (parse as any)[units.replace(/s$/, "")];
  if (!unitValue) return null;
  const result = unitValue * parseFloat(value);
  return Math.abs(Math.round(result * 1000) / 1000);
} as ParseFunction;

parse.millisecond = parse.ms = 0.001;
parse.second = parse.sec = parse.s = parse[""] = 1;
parse.minute = parse.min = parse.m = parse.s * 60;
parse.hour = parse.hr = parse.h = parse.m * 60;
parse.day = parse.d = parse.h * 24;
parse.week = parse.wk = parse.w = parse.d * 7;
parse.year = parse.yr = parse.y = parse.d * 365.25;
parse.month = parse.b = parse.y / 12;

// "nanoid" imported manually
// Something about improved GZIP performance with this string
const urlAlphabet =
  "useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict";

export function createId(): string {
  let size = 24;
  let id = "";
  let bytes = crypto.getRandomValues(new Uint8Array(size));
  while (size--) {
    // Using the bitwise AND operator to "cap" the value of
    // the random byte from 255 to 63, in that way we can make sure
    // that the value will be a valid index for the "chars" string.
    id += urlAlphabet[bytes[size] & 61];
  }
  return id;
}

export function unix(expires: number | null): number | null {
  const now = new Date().getTime();
  return expires === null ? null : now + expires * 1000;
}

export { parse };
