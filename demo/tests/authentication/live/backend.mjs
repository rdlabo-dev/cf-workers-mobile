export async function startLiveBackend() {
  const url = new URL(process.env.NATIVE_TEST_OAUTH_ORIGIN);
  const token = process.env.NATIVE_TEST_ADMIN_TOKEN;
  if (
    url.protocol !== "https:" ||
    !token ||
    !process.env.NATIVE_TEST_OAUTH_CLIENT_ID
  )
    throw Error(
      "Set HTTPS NATIVE_TEST_OAUTH_ORIGIN, NATIVE_TEST_ADMIN_TOKEN and NATIVE_TEST_OAUTH_CLIENT_ID",
    );
  const reports = [],
    evidence = [];
  const refresh = async (reset = false) => {
    const response = await fetch(new URL("/__acceptance/control", url), {
      method: reset ? "POST" : "GET",
      headers: { authorization: `Bearer ${token}` },
      redirect: "error",
    });
    if (!response.ok) throw Error(`Live OAuth control: ${response.status}`);
    const state = await response.json();
    reports.splice(0, reports.length, ...state.reports);
    evidence.splice(0, evidence.length, ...state.evidence);
  };
  await refresh(true);
  return {
    url,
    reports,
    evidence,
    requests: [],
    clientId: process.env.NATIVE_TEST_OAUTH_CLIENT_ID,
    refresh: () => refresh(),
    close: async () => {},
  };
}
