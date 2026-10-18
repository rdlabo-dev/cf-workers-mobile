export interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
  props: Record<string, unknown>;
}

export interface WorkerHandler<Env = Record<string, unknown>> {
  fetch(
    request: Request,
    env: Env,
    ctx: WorkerContext,
  ): Response | Promise<Response>;
}

/** Creates a Dedicated Worker connected to the public serve() entry. */
export type WorkerFactory = () => Worker;

export interface FetchRuntimeOptions<Env> {
  /** Absolute HTTP(S) URL. Its path is the interception boundary, not a prefix to append. */
  baseURL: string;
  /** Optional local values; never automatically copies server secrets. */
  env?: Env;
  onBackgroundError?: (error: unknown) => void;
}

export interface LoadedWorker<Env = Record<string, unknown>> {
  handler: WorkerHandler<Env>;
  dispose(): void | Promise<void>;
}

/** Supplied by a build plugin or explicit ESM wiring; direct code loads only when selected. */
export interface WorkerSource<Env = Record<string, unknown>> {
  createWorker: WorkerFactory;
  loadDirect(): Promise<WorkerHandler<Env> | LoadedWorker<Env>>;
}
export type ExecutionPreference = "worker" | "direct";

export interface CapacitorWorkersOptions<Env> extends FetchRuntimeOptions<Env> {
  /** Optional when configured by the Vite or esbuild plugin. */
  worker?: WorkerHandler<Env> | WorkerFactory | WorkerSource<Env>;
  /** Native document rendering: initial local path (for example "/"). Omit for Fetch-only use. */
  render?: string;
  /** Applies to a configured WorkerSource; defaults to worker. */
  prefer?: ExecutionPreference;
}
