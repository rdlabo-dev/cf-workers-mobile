/** Supplies a user-specific token at request time; never bundle a server secret. */
export interface AuthProvider {
  /** Return a user token, or undefined for unauthenticated requests. */
  getToken(): Promise<string | undefined>;
}

export interface SecureClientOptions {
  /** HTTPS API root; requests may not escape its origin and path. */
  baseURL: string;
  /** Optional bearer token provider; do not use a Cloudflare API token. */
  authProvider?: AuthProvider;
  /** For cookie-backed sessions. Browser and native cookie stores may differ. */
  credentials?: RequestCredentials;
  /** Underlying fetch implementation; defaults to global fetch. */
  fetch?: typeof fetch;
}

/** A scoped fetch client. The caller handles login, refresh, and 401 responses. */
export interface SecureClient {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
