import { hashNames } from "./hash-handle.js";
export function getHashes() {
  return [...hashNames];
}
// Copyright (c) 2017-2022 Cloudflare, Inc.
// Licensed under Apache-2.0: https://opensource.org/licenses/Apache-2.0
// Adapted from workerd@5358e3d337336eaf696a48bc1563d808b10feba5.
export function getCurves(): string[] {
  return ["secp224r1", "prime256v1", "secp384r1", "secp521r1"];
}
export function secureHeapUsed(): Record<string, number> {
  return { total: 0, used: 0, utilization: 0, min: 0 };
}
function unavailable(method: string): never {
  throw Object.assign(new Error(`The ${method} method is not implemented`), {
    code: "ERR_METHOD_NOT_IMPLEMENTED",
  });
}
export function setEngine(_engine: string, _flags?: number): never {
  return unavailable("setEngine");
}
export function setFips(_enabled: boolean): never {
  return unavailable("setFips");
}
// Do not copy Workers' fips=true: this adapter uses JavaScript algorithms,
// not Workers' FIPS backend. That capability remains an explicit boundary.

export { getCipherInfo } from "./cipher-info.js";
