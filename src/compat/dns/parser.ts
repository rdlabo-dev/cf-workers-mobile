// Port of workerd src/rust/api/dns.rs at 5358e3d337336eaf696a48bc1563d808b10feba5.
// Copyright Cloudflare, Inc. Apache-2.0; see LICENSE-APACHE.
const whitespace = /[\t\n\v\f\r ]/;
function integer(input: string, radix: 10 | 16, bits: number): number {
  if (!input) throw new RangeError("cannot parse integer from empty string");
  if (!(radix === 10 ? /^\+?\d+$/ : /^\+?[\da-f]+$/i).test(input))
    throw new RangeError("invalid digit found in string");
  const value = BigInt((radix === 16 ? "0x" : "") + input.replace(/^\+/, ""));
  if (value > (1n << BigInt(bits)) - 1n)
    throw new RangeError("number too large to fit in target type");
  return Number(value);
}
function decodeHex(parts: string[]): string {
  return parts
    .map((part) => {
      const code = integer(part, 16, 16);
      if (code >= 0xd800 && code <= 0xdfff)
        throw new Error("Invalid UTF-16 sequence");
      return String.fromCharCode(code);
    })
    .join("");
}
function fields(input: string): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < input.length) {
    while (i < input.length && whitespace.test(input[i]!)) i++;
    if (i === input.length) break;
    const quoted = input[i] === '"';
    if (quoted) i++;
    let field = "",
      closed = false;
    while (i < input.length) {
      const c = input[i++]!;
      if (quoted && c === '"') {
        closed = true;
        break;
      }
      if (!quoted && whitespace.test(c)) break;
      if (c !== "\\") {
        field += c;
        continue;
      }
      if (i === input.length)
        throw new Error("unterminated escape or quote in RDATA");
      const digits = input.slice(i, i + 3);
      if (/^\d{3}$/.test(digits)) {
        field += String.fromCharCode(integer(digits, 10, 8));
        i += 3;
      } else field += input[i++];
    }
    if (quoted && !closed)
      throw new Error("unterminated escape or quote in RDATA");
    result.push(field);
  }
  return result;
}
function validateField(field: string) {
  if (!["issue", "issuewild", "iodef"].includes(field))
    throw new Error(`Received unknown field '${field}'`);
}
export function parseCaaRecord(record: string) {
  const parts = record.split(/[\t\n\v\f\r ]+/).filter(Boolean);
  if (parts[0] !== "\\#") {
    const values = fields(record);
    if (values.length !== 3)
      throw new Error(`CAA record expected 3 fields, got ${values.length}`);
    const [critical, field, value] = values as [string, string, string];
    validateField(field);
    return { critical: integer(critical, 10, 8), field, value };
  }
  if (parts.length < 3)
    throw new Error("CAA record too short: expected at least 3 fields");
  const data = parts.slice(2);
  if (data.length < 2)
    throw new Error(
      "CAA record data too short: expected critical and prefix length fields",
    );
  const critical = integer(data[0]!, 16, 8),
    length = integer(data[1]!, 16, 64);
  if (data.length < 2 + length)
    throw new Error(`CAA record data too short for prefix_length ${length}`);
  const field = decodeHex(data.slice(2, 2 + length)),
    value = decodeHex(data.slice(2 + length));
  validateField(field);
  return { critical, field, value };
}
function replacement(data: string[]): string {
  const labels: string[] = [];
  for (let i = 0; i < data.length; ) {
    const length = integer(data[i++]!, 16, 64);
    if (i + length > data.length)
      throw new Error("replacement data too short for declared frame length");
    const label = decodeHex(data.slice(i, i + length));
    if (label) labels.push(label);
    i += length;
  }
  return labels.join(".");
}
export function parseNaptrRecord(record: string) {
  const parts = record.split(/[\t\n\v\f\r ]+/).filter(Boolean);
  if (parts[0] !== "\\#") {
    const values = fields(record);
    if (values.length !== 6)
      throw new Error(`NAPTR record expected 6 fields, got ${values.length}`);
    const [order, preference, flags, service, regexp, host] = values as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    return {
      flags,
      service,
      regexp,
      replacement: host.replace(/\.$/, ""),
      order: integer(order, 10, 32),
      preference: integer(preference, 10, 32),
    };
  }
  if (parts.length < 2) throw new Error("NAPTR record too short");
  const data = parts.slice(1);
  if (data.length < 6)
    throw new Error("NAPTR record data too short: expected at least 6 fields");
  const order = integer(data.slice(1, 3).join(""), 16, 32),
    preference = integer(data.slice(3, 5).join(""), 16, 32);
  let i = 5;
  const take = (name: string, extra: number) => {
    const length = integer(data[i++]!, 16, 64);
    if (data.length < i + length + extra)
      throw new Error(`NAPTR record too short for ${name} field`);
    const value = decodeHex(data.slice(i, i + length));
    i += length;
    return value;
  };
  const flags = take("flags", 1),
    service = take("service", 1),
    regexp = take("regexp", 0);
  return {
    flags,
    service,
    regexp,
    replacement: replacement(data.slice(i)),
    order,
    preference,
  };
}
export default { parseCaaRecord, parseNaptrRecord };
