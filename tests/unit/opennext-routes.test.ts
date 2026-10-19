import { expect, it } from "vitest";
import { planRoutes, selector } from "../../src/tooling/opennext/plan.js";
import { permitsPath } from "../../src/tooling/route-permissions.js";
import {
  publicEnvironment,
  applicationCloudflareContext,
} from "../../src/tooling/opennext/safety.js";

it("does not admit private environment exports or evaluate unknown generated code", () => {
  expect(
    publicEnvironment('export const production = {NEXT_PUBLIC_TITLE: "News"};'),
  ).toBe(true);
  for (const code of [
    'export const production = {UNSELECTED_ROUTE_KEY: "private-marker"};',
    "export const production = {...secret};",
    'export const production = {[key]: "value"};',
    "export const production = loadEnvironment();",
    "globalThis.executed = true;",
  ])
    expect(publicEnvironment(code)).toBe(false);
});

it("rejects opaque application Cloudflare context access independently of the binding name", () => {
  const host = 'Symbol.for("__cloudflare-context__")';
  expect(applicationCloudflareContext(host)).toBe(false);
  expect(
    applicationCloudflareContext(host + "; getCloudflareContext().env[name]"),
  ).toBe(true);
  expect(
    applicationCloudflareContext(
      host + '; Symbol.for("__cloudflare-context__")',
    ),
  ).toBe(true);
  expect(
    applicationCloudflareContext(
      host + '; import {env} from "cloudflare:workers"',
    ),
  ).toBe(true);
});

it("selects only permitted static routes without matching middleware", () => {
  const plan = planRoutes(
    {
      "/page": "app/page.js",
      "/account/page": "app/account/page.js",
      "/news/[id]/page": "app/news/[id]/page.js",
      "/(private)/page": "app/(private)/page.js",
      "/api/public/route": "app/api/public/route.js",
    },
    [{ method: "*", path: "*" }],
    ["^/account/?$"],
  );
  expect(
    plan.filter((route) => !route.remote).map((route) => route.path),
  ).toEqual(["/", "/api/public"]);
  expect(plan.find((route) => route.path === "/account")?.reason).toContain(
    "middleware",
  );
  expect(
    planRoutes(
      { "/page": "app/page.js" },
      [{ method: "POST", path: "/" }],
      [],
    )[0].remote,
  ).toBe(true);
});

it("uses the same registration permissions without mutating stateful RegExp", () => {
  const route = { method: "GET" as const, path: /^\/app/g };
  route.path.lastIndex = 3;
  expect(permitsPath(route, "/app")).toBe(true);
  expect(permitsPath(route, "/app")).toBe(true);
  expect(route.path.lastIndex).toBe(3);
  expect(permitsPath({ method: "*", path: "/app/*" }, "/app")).toBe(true);
  expect(permitsPath({ method: "*", path: "/app/*" }, "/apple")).toBe(false);
});

it("keeps framework protocols, credentials, unknown paths and mutations remote", () => {
  const needsRemote = new Function(
    selector(["/", "/api/public"]).replace("export ", "") +
      ";return needsRemote;",
  )() as (request: Request) => boolean;
  expect(needsRemote(new Request("https://worker.invalid/?q=hello"))).toBe(
    false,
  );
  for (const path of ["/account", "/api/public/", "/?_rsc=1"])
    expect(needsRemote(new Request("https://worker.invalid" + path))).toBe(
      true,
    );
  for (const method of ["HEAD", "POST", "PUT", "DELETE"])
    expect(
      needsRemote(new Request("https://worker.invalid/", { method })),
    ).toBe(true);
  for (const header of [
    "cookie",
    "authorization",
    "rsc",
    "next-action",
    "next-router-state-tree",
    "next-router-prefetch",
    "next-router-segment-prefetch",
    "x-middleware-subrequest",
  ])
    expect(
      needsRemote(
        new Request("https://worker.invalid/", { headers: { [header]: "1" } }),
      ),
    ).toBe(true);
});
