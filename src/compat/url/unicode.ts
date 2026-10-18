// Ada 4.0.0 IDNA processing, matching workerd 1.20261012.1.
// Keep its mapping, ContextJ and Bidi semantics together with its pinned tables.
// @ts-expect-error punycode ships JavaScript without declarations.
import { decode, encode } from "punycode/";
import * as data from "./idna-data.js";
const ascii = /^[\x00-\x7f]*$/;
const encoder = new TextEncoder();
function lookup(ranges: number[][], code: number, fallback: number): number {
  let lo = 0,
    hi = ranges.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (ranges[mid]![1]! < code) lo = mid + 1;
    else hi = mid;
  }
  const range = ranges[lo];
  return range && range[0]! <= code ? (range[2] ?? 1) : fallback;
}
function mapped(input: string): string | null {
  let output = "";
  for (const c of input) {
    const status = lookup(data.mapping, c.codePointAt(0)!, data.disallowed);
    if (status === data.disallowed) return null;
    output +=
      status === data.valid
        ? c
        : (data.strings as Record<number, string>)[status]!;
  }
  return output;
}
function validLabel(label: string): boolean {
  const points = Array.from(label, (c) => c.codePointAt(0)!);
  if (!points.length) return true;
  if (lookup(data.combining, points[0]!, 0)) return false;
  for (let i = 0; i < points.length; i++) {
    const c = points[i];
    if (c !== 0x200c && c !== 0x200d) continue;
    // The pinned engine returns on its first joiner, including successful
    // virama validation; do not substitute newer Unicode ContextJ behavior.
    if (i > 0 && data.virama.includes(points[i - 1]!)) return true;
    if (c === 0x200d || i === 0 || i + 1 === points.length) return false;
    return (
      points
        .slice(0, i)
        .some((p) => data.L.includes(p) || data.D.includes(p)) &&
      points.slice(i + 1).some((p) => data.R.includes(p) || data.D.includes(p))
    );
  }
  const directions = points.map((p) => lookup(data.directions, p, 0));
  while (directions.at(-1) === 8) directions.pop();
  if (!directions.length) return false;
  if (!directions.some((d) => d === 7 || d === 9 || d === 10)) return true;
  const last = directions.at(-1)!;
  if (directions[0] === 6)
    return (
      directions.every((d) => [6, 5, 3, 2, 11, 4, 1, 8].includes(d)) &&
      [6, 5].includes(last)
    );
  return (
    [7, 9].includes(directions[0]!) &&
    directions.every((d) => [7, 9, 10, 5, 3, 2, 11, 4, 1, 8].includes(d)) &&
    !(directions.includes(5) && directions.includes(10)) &&
    [7, 9, 10, 5].includes(last)
  );
}
function decodedLabel(label: string): string | null {
  try {
    const decoded: string = decode(label.slice(4));
    if (
      ascii.test(decoded) ||
      mapped(decoded) !== decoded ||
      decoded.normalize("NFC") !== decoded ||
      !validLabel(decoded)
    )
      return null;
    return decoded;
  } catch {
    return null;
  }
}
export function toASCII(input: string): string {
  if (encoder.encode(input).length > 16384) return "";
  if (ascii.test(input)) return input.toLowerCase();
  const value = mapped(input);
  if (value === null) return "";
  const labels = value.normalize("NFC").split(".");
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]!;
    if (label.startsWith("xn--")) {
      if (!ascii.test(label) || decodedLabel(label) === null) return "";
    } else if (!ascii.test(label)) {
      if (!validLabel(label)) return "";
      try {
        labels[i] = "xn--" + encode(label);
      } catch {
        return "";
      }
    }
  }
  return labels.join(".");
}
export function toUnicode(input: string): string {
  if (encoder.encode(input).length > 16384) return input;
  return input
    .split(".")
    .map((label) =>
      label.startsWith("xn--") ? (decodedLabel(label) ?? label) : label,
    )
    .join(".");
}
