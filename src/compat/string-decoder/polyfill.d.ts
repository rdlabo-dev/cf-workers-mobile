declare module "string_decoder/lib/string_decoder.js" {
  export class StringDecoder {
    constructor(encoding?: string);
    encoding: string;
    lastChar: Uint8Array;
    lastNeed: number;
    lastTotal: number;
    write(buffer: Uint8Array): string;
    end(buffer?: Uint8Array): string;
    text(buffer: Uint8Array, offset?: number): string;
    fillLast(buffer: Uint8Array): string | undefined;
  }
}
