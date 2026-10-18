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
