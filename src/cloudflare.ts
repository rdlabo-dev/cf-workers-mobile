/** Opt-in types for the Cloudflare API implemented by the browser adapter. */
declare module "cloudflare:node" {
  export const handleAsNodeRequest: typeof import("./cloudflare/apis/cloudflare-node/index.js").handleAsNodeRequest;
  export const handleAsNodeConnection: typeof import("./cloudflare/apis/cloudflare-node/index.js").handleAsNodeConnection;
  export const connectHandler: typeof import("./cloudflare/apis/cloudflare-node/index.js").connectHandler;
  export const httpServerHandler: typeof import("./cloudflare/apis/cloudflare-node/index.js").httpServerHandler;
}
