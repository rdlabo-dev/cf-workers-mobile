import { expect, it } from "vitest";
import { authorizationCode } from "../../demo/authentication/callback";
const callback = "jp.rdlabo.workerscapacitor.authentication://oauth/callback";
it("accepts only the registered callback and current login state", () => {
  expect(
    authorizationCode(
      callback + "?code=one-use&state=expected",
      callback,
      "expected",
    ),
  ).toBe("one-use");
  for (const url of [
    "not a url",
    "other://oauth/callback?code=x&state=expected",
    "jp.rdlabo.workerscapacitor.authentication://other/callback?code=x&state=expected",
    callback + "/other?code=x&state=expected",
  ])
    expect(authorizationCode(url, callback, "expected")).toBeUndefined();
});
it.each([
  "?code=x&state=wrong",
  "?code=x",
  "?code=x&state=expected&state=other",
  "?code=x&state=expected#fragment",
  "?state=expected",
  "?code=x&code=y&state=expected",
  "?error=access_denied&state=expected",
])("rejects invalid OAuth callback %s", (query) => {
  expect(() =>
    authorizationCode(callback + query, callback, "expected"),
  ).toThrow();
});
