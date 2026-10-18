export interface Invocation {
  port: MessagePort;
  url: string;
  method: string;
  headers: [string, string][];
  hasBody: boolean;
  env: unknown;
}
export type Command =
  | "pull"
  | "cancel"
  | "abort"
  | { type: "upload-chunk"; value: Uint8Array }
  | { type: "upload-end" }
  | { type: "upload-error"; message: string };
export type Reply =
  | { type: "upload-pull" }
  | { type: "upload-cancel" }
  | {
      type: "response";
      status: number;
      statusText: string;
      headers: [string, string][];
      hasBody: boolean;
    }
  | { type: "chunk"; value: Uint8Array }
  | { type: "end" }
  | { type: "error"; name: string; message: string }
  | { type: "done"; errors: string[] };
