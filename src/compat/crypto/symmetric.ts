import { Buffer } from "node:buffer";
import { Transform } from "../stream/transform.js";
// @ts-expect-error dependency has no declarations
import original from "crypto-browserify/index.js";
import { secretMaterial } from "./keys.js";
const BaseTransform =
  Transform as unknown as typeof import("node:stream").Transform;
const handles = new WeakMap<object, any>();
class CipherTransform extends BaseTransform {
  constructor(
    decrypt: boolean,
    algorithm: string,
    key: unknown,
    iv: unknown,
    options?: any,
  ) {
    super(options);
    handles.set(
      this,
      (decrypt ? original.createDecipheriv : original.createCipheriv)(
        algorithm,
        secretMaterial(key),
        iv,
        options,
      ),
    );
  }
  update(data: unknown, inputEncoding?: string, outputEncoding?: string): any {
    return handles.get(this).update(data, inputEncoding, outputEncoding);
  }
  final(encoding?: string): any {
    return handles.get(this).final(encoding);
  }
  setAutoPadding(value?: boolean): this {
    handles.get(this).setAutoPadding(value);
    return this;
  }
  setAAD(data: unknown, options?: any): this {
    handles.get(this).setAAD(data, options);
    return this;
  }
  getAuthTag(): any {
    return handles.get(this).getAuthTag();
  }
  setAuthTag(data: unknown): this {
    handles.get(this).setAuthTag(data);
    return this;
  }
  override _transform(chunk: any, encoding: any, callback: any) {
    try {
      this.push(this.update(chunk, encoding));
      callback();
    } catch (error) {
      callback(error);
    }
  }
  override _flush(callback: any) {
    try {
      this.push(this.final());
      callback();
    } catch (error) {
      callback(error);
    }
  }
}
export class Cipheriv extends CipherTransform {
  constructor(algorithm: string, key: unknown, iv: unknown, options?: any) {
    super(false, algorithm, key, iv, options);
  }
}
export class Decipheriv extends CipherTransform {
  constructor(algorithm: string, key: unknown, iv: unknown, options?: any) {
    super(true, algorithm, key, iv, options);
  }
}
export function createCipheriv(
  algorithm: string,
  key: unknown,
  iv: unknown,
  options?: any,
) {
  return new Cipheriv(algorithm, key, iv, options);
}
export function createDecipheriv(
  algorithm: string,
  key: unknown,
  iv: unknown,
  options?: any,
) {
  return new Decipheriv(algorithm, key, iv, options);
}
