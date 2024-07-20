const times = /(-?(?:\d+\.?\d*|\d*\.?\d+)(?:e[-+]?\d+)?)\s*([\p{L}]*)/iu;

parse.millisecond = parse.ms = 0.001;
parse.second = parse.sec = parse.s = parse[""] = 1;
parse.minute = parse.min = parse.m = parse.s * 60;
parse.hour = parse.hr = parse.h = parse.m * 60;
parse.day = parse.d = parse.h * 24;
parse.week = parse.wk = parse.w = parse.d * 7;
parse.year = parse.yr = parse.y = parse.d * 365.25;
parse.month = parse.b = parse.y / 12;

// Returns the time in milliseconds
function parse(str) {
  if (str === null || str === undefined) return null;
  if (typeof str === "number") return str;
  // ignore commas/placeholders
  str = str.toLowerCase().replace(/[,_]/g, "");
  let [_, value, units] = times.exec(str) || [];
  if (!units) return null;
  const unitValue = parse[units] || parse[units.replace(/s$/, "")];
  if (!unitValue) return null;
  const result = unitValue * parseFloat(value, 10);
  return Math.abs(Math.round(result * 1000) / 1000);
}

// "nanoid" imported manually
// Something about improved GZIP performance with this string
const urlAlphabet =
  "useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict";

function createId() {
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

export { parse, createId };
