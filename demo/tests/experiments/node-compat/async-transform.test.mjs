import { test } from "node:test";
import assert from "node:assert/strict";
import { transform } from "esbuild";
import { chromium, webkit } from "@playwright/test";

// Isolate the build-time route before changing the production ALS adapter.
// The host has no engine hooks: capture is possible only at explicit .then().
const source = `
const originalThen = Promise.prototype.then;
let current;
function scope(value, callback) { const previous=current;current=value;try{return callback();}finally{current=previous;} }
Promise.prototype.then=function(onValue,onError) {
 const captured=current;
 const bind=callback=>typeof callback==='function'?value=>scope(captured,()=>callback(value)):callback;
 return originalThen.call(this,bind(onValue),bind(onError));
};
async function scenario() {
 const seen=[];
 const values=await Promise.all(['a','b'].map(value=>scope(value,async()=>{
   seen.push(current);
   await Promise.resolve();
   const first=current;
   await new Promise(resolve=>setTimeout(resolve,0));
   const second=current;
   const nested=await scope(value+'-nested',async()=>{await Promise.resolve();return current;});
   return [first,second,nested,current];
 })));
 return {seen,values,restored:current===undefined};
}
return scenario().finally(()=>{Promise.prototype.then=originalThen;});
`;
for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: lowering async/await exposes continuation boundaries to JS`, async () => {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      const native = await page.evaluate((code) => Function(code)(), source);
      const compiled = await transform(source, {
        loader: "js",
        target: "es2016",
      });
      const lowered = await page.evaluate(
        (code) => Function(code)(),
        compiled.code,
      );
      const expected = {
        seen: ["a", "b"],
        values: [
          ["a", "a", "a-nested", "a"],
          ["b", "b", "b-nested", "b"],
        ],
        restored: true,
      };
      assert.notDeepEqual(native, expected);
      assert.deepEqual(lowered, expected);
    } finally {
      await browser.close();
    }
  });
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: lowering callers does not instrument untransformed async callbacks`, async () => {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      // Function deliberately represents code loaded outside the bundle transform.
      const mixed = source
        .replace(
          "async function scenario() {",
          "const external = Function('read', 'return (async()=>{await Promise.resolve();return read()})()');\nasync function scenario() {",
        )
        .replace(
          "const first=current;",
          "const externalStore=await external(()=>current);\n   const first=externalStore;",
        );
      const compiled = await transform(mixed, {
        loader: "js",
        target: "es2016",
      });
      const actual = await page.evaluate(
        (code) => Function(code)(),
        compiled.code,
      );
      assert.deepEqual(actual.seen, ["a", "b"]);
      // Only the continuation inside the external native async function loses its store.
      assert.deepEqual(actual.values, [
        [undefined, "a", "a-nested", "a"],
        [undefined, "b", "b-nested", "b"],
      ]);
      assert.equal(actual.restored, true);
    } finally {
      await browser.close();
    }
  });
  test(`${name}: ordinary async lowering changes native Promise then-property access`, async () => {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      const code = `
const value=Promise.resolve(42);
Object.defineProperty(value,'then',{get(){throw new Error('observable then access')}});
return (async()=>{try{return {value:await value};}catch(error){return {error:error.message};}})();
`;
      const native = await page.evaluate((source) => Function(source)(), code);
      const compiled = await transform(code, {
        loader: "js",
        target: "es2016",
      });
      const lowered = await page.evaluate(async (source) => {
        try {
          return await Function(source)();
        } catch (error) {
          return { error: error.message };
        }
      }, compiled.code);
      assert.deepEqual(native, { value: 42 });
      assert.deepEqual(lowered, { error: "observable then access" });
    } finally {
      await browser.close();
    }
  });
}
