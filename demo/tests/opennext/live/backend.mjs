export async function startLiveBackend() {
  const url = new URL(process.env.NATIVE_TEST_ORIGIN);
  const admin = process.env.NATIVE_TEST_ADMIN_TOKEN;
  if (
    url.protocol !== "https:" ||
    !admin ||
    !process.env.NATIVE_TEST_DEVICE_TOKEN
  )
    throw Error(
      "Set HTTPS NATIVE_TEST_ORIGIN, NATIVE_TEST_ADMIN_TOKEN and NATIVE_TEST_DEVICE_TOKEN",
    );
  const reports = [];
  const config = { mode: "flow", id: crypto.randomUUID() };
  let sessionCount;
  const control = async (body) => {
    const response = await fetch(new URL("/__acceptance/control", url), {
      method: body ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${admin}`,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
    });
    if (!response.ok)
      throw Error(`Live acceptance control: ${response.status}`);
    const state = await response.json();
    reports.splice(0, reports.length, ...state.reports);
    sessionCount = state.sessionCount;
  };
  return {
    url,
    reports,
    config,
    configure: () => control(config),
    refresh: () => control(),
    sessionCount: () => sessionCount,
    close: async () => {},
  };
}
