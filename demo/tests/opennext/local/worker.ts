// Test-only wrapper: the OpenNext application is imported without source changes.
// @ts-expect-error OpenNext emits JavaScript without declarations.
import worker from "../../../opennext/.open-next/worker.js";
const errors: string[] = [];
const originalError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  errors.push(
    args
      .map((value) =>
        value instanceof Error
          ? String(value) + "\n" + value.stack
          : String(value),
      )
      .join(" "),
  );
  originalError(...args);
};
export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const response = await worker.fetch(request, env, ctx);
    if (
      !import.meta.env.VITE_REPORT_ORIGIN ||
      !response.headers.get("content-type")?.includes("text/html")
    )
      return response;
    const debug =
      response.status >= 500
        ? `<pre>${errors.join("\n").replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</pre>`
        : "";
    const html = (await response.text()).replace(
      "</body>",
      debug + '<script src="/__local-acceptance.js"></script></body>',
    );
    return new Response(html, {
      status: response.status,
      headers: response.headers,
    });
  },
};
