import { describe, expect, it } from "vitest";
import {
  readVoidPlan,
  voidSelector,
  usesServerProcess,
} from "../../src/tooling/void/plan.js";

const entry = `
var components = {about:()=>import("./assets/about.js"),private:()=>import("./assets/private.js")};
var layoutTree = {};
function renderPage(value) { return renderReactPage({components,layoutTree,value}); }
//#region virtual:void-routes
var app = new Hono();
var __routingRuntime=createRoutingRuntime(app,{dev:false,nodeTarget:false,managedDispatch:false});
var __voidHeadConfig = null;
var getPagesAssetTags = createClientAssetTags({dev:false});
var _load_api = createModuleLoader(()=>import("./assets/api.js"),true);
app.use(__routingRuntime.contextMiddleware);
app.use(__routingRuntime.requestMiddleware);
app.get("/api/hello",createHttpRouteHandler(_load_api,"GET"));
app.get("/about",createPageGetHandler({componentId:"about",render:renderPage,assets:getPagesAssetTags,headConfig:__voidHeadConfig,renderOptions:{renderMode:"server"}}));
app.on(["POST","PUT","PATCH","DELETE"],"/about",createPageMutationHandler({}));
app.all("/__void/*", ()=>{});
//#region .void/entry.ts
`;

describe("generated Void route boundaries", () => {
  it("allows React's process error reporter but rejects environment access and aliases", () => {
    expect(
      usesServerProcess(
        'if(typeof process === "object") process.emit("uncaughtException", error)',
      ),
    ).toBe(false);
    for (const code of [
      "process.env.SECRET",
      "const p = process; p.env.SECRET",
      "const {env} = process",
      'process["env"].SECRET',
      "process[method]()",
    ])
      expect(usesServerProcess(code)).toBe(true);
  });
  it("reads generated GET registrations and extracts only the selected renderer graph", () => {
    const plan = readVoidPlan(entry);
    expect(plan.routes).toEqual([
      { path: "/api/hello", method: "GET", module: "./assets/api.js" },
      {
        path: "/about",
        method: "GET",
        module: undefined,
        component: "about",
        renderMode: "server",
      },
      { path: "/about", method: "POST/PUT/PATCH/DELETE" },
    ]);
    expect(plan.renderer(["about"])).toContain("./assets/about.js");
    expect(plan.renderer(["about"])).not.toContain("private.js");
    expect(plan.renderer(["about"])).not.toContain("/__void/");
    expect(plan.renderer(["about"])).not.toContain("createPageMutationHandler");
  });
  it("rejects application middleware and unknown output", () => {
    expect(() =>
      readVoidPlan(
        entry.replace(
          "app.use(__routingRuntime.contextMiddleware)",
          "app.use(authentication)",
        ),
      ),
    ).toThrow(/middleware/);
    expect(() =>
      readVoidPlan(
        entry.replace(
          "var __voidHeadConfig = null",
          "var __voidHeadConfig = secret",
        ),
      ),
    ).toThrow(/head/);
    expect(() =>
      readVoidPlan(
        entry.replace("//#region virtual:void-routes", "// missing marker"),
      ),
    ).toThrow(/entry/);
  });
  it("routes unknown requests, mutations and authentication to the network before invoking a handler", () => {
    const needsRemote = new Function(
      voidSelector(["/about"]).replace("export ", "") + ";return needsRemote",
    )();
    expect(needsRemote(new Request("https://app.test/about"))).toBe(false);
    for (const request of [
      new Request("https://app.test/about", { method: "POST" }),
      new Request("https://app.test/about", {
        headers: { cookie: "session=value" },
      }),
      new Request("https://app.test/about", {
        headers: { authorization: "Bearer token" },
      }),
      new Request("https://app.test/__void/db"),
      new Request("https://app.test/unknown"),
    ])
      expect(needsRemote(request)).toBe(true);
  });
  it("rejects additional route middleware and unexpected method registrations", () => {
    expect(() =>
      readVoidPlan(
        entry.replace(
          'app.get("/about",createPageGetHandler',
          'app.get("/about",authentication,createPageGetHandler',
        ),
      ),
    ).toThrow();
    expect(() =>
      readVoidPlan(
        entry.replace(
          '["POST","PUT","PATCH","DELETE"]',
          '["GET","PUT","PATCH","DELETE"]',
        ),
      ),
    ).toThrow(/registration/);
    expect(() =>
      readVoidPlan(entry.replace('app.get("/about",', 'app.all("/about",')),
    ).toThrow(/registration/);
  });
});
