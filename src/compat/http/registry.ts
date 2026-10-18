import { tcpPorts } from "../net/ports.js";
export const kSetIncomingBody = Symbol("setIncomingBody");
export const kSetIncomingFetchResponse = Symbol("setIncomingFetchResponse");
export const kSetIncomingSocket = Symbol("setIncomingSocket");

export interface InboundSocket {
  opened: Promise<{ localAddress?: string | null }>;
}

export interface LogicalPortHandler {
  server?: unknown;
  createRequestResponse?: () => unknown;
  fetch?: (request: Request, env?: unknown, ctx?: unknown) => Promise<Response>;
  connect?: (
    socket: InboundSocket,
    env?: unknown,
    ctx?: unknown,
  ) => Promise<void>;
}

export const getHandler = (port: number) => tcpPorts.getHandler(port);
export function setHandler(port: number, handler: LogicalPortHandler): void {
  if (!tcpPorts.tryBind(port)) throw new Error(`Port ${port} is already bound`);
  tcpPorts.setHandler(port, handler);
}
export const release = (port: number) => tcpPorts.release(port);
export const hasHandler = (port: number) => tcpPorts.isBound(port);
export const ephemeral = () => tcpPorts.ephemeral();
