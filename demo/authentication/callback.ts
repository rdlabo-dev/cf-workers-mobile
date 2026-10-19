/** Ignore unrelated deep links; reject malformed callbacks for this login. */
export function authorizationCode(
  address: string,
  redirectUri: string,
  state: string,
): string | undefined {
  let result: URL;
  try {
    result = new URL(address);
  } catch {
    return;
  }
  const callback = new URL(redirectUri);
  if (
    result.protocol !== callback.protocol ||
    result.host !== callback.host ||
    result.pathname !== callback.pathname
  )
    return;
  if (
    result.hash ||
    result.username ||
    result.password ||
    result.searchParams.getAll("state").length !== 1 ||
    result.searchParams.get("state") !== state
  )
    throw new Error("OAuth state mismatch");
  if (result.searchParams.has("error")) throw new Error("Authorization denied");
  const code = result.searchParams.get("code");
  if (!code || result.searchParams.getAll("code").length !== 1)
    throw new Error("Missing or ambiguous authorization code");
  return code;
}
