import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { runNativeAcceptance } from "../native/acceptance.mjs";
import { startBackend, redirectUri } from "./backend.mjs";
const here = fileURLToPath(new URL(".", import.meta.url));
const shell = fileURLToPath(new URL("../../authentication/", import.meta.url));
test(
  "system browser OAuth with PKCE and Worker-owned HttpOnly session",
  { timeout: 600000 },
  async () => {
    const backend = await startBackend();
    const options = {
      authorizationEndpoint: new URL("/authorize", backend.url).href,
      tokenEndpoint: new URL("/token", backend.url).href,
      clientId: "native-test",
      redirectUri,
      scope: "profile",
    };
    await runNativeAcceptance({
      backend,
      shell,
      appId: "jp.rdlabo.workerscapacitor.authentication",
      timeout: 150000,
      artifacts: fileURLToPath(
        new URL("../../artifacts/authentication-native/", import.meta.url),
      ),
      worker: join(here, "worker.ts"),
      workerConfig: join(here, "wrangler.jsonc"),
      bootstrapCode: `
import { workersCapacitor } from 'workers-capacitor';
import { Capacitor, CapacitorHttp } from ${JSON.stringify(join(shell, "node_modules/@capacitor/core/dist/index.js"))};
import { login } from ${JSON.stringify(join(shell, "login.ts"))};
try {
  // The hidden document host is a plain WebView without the native UI bridge.
  if (Capacitor.isNativePlatform()) {
    const token = await login(${JSON.stringify(options)});
    const session = await CapacitorHttp.post({
      url: ${JSON.stringify(new URL("/session", backend.url).href)},
      headers: { authorization: 'Bearer ' + token },
      disableRedirects: true,
    });
    if (session.status !== 204) throw Error('Session exchange failed');
  }
  const runtime = workersCapacitor({
    baseURL: 'https://worker.invalid/',
    remote: { origin: ${JSON.stringify(backend.url.origin)} },
    render: '/',
  });
  await runtime.ready;
} catch (error) {
  await CapacitorHttp.post({
    url: ${JSON.stringify(new URL("/__acceptance/report", backend.url).href)},
    headers: { 'content-type': 'application/json' },
    data: { stage: 'failure', error: String(error) },
  });
}`,
      configureNative: async ({ shell, platform }) => {
        if (platform === "ios") {
          const path = join(shell, "ios/App/App/Info.plist");
          let source = await readFile(path, "utf8");
          if (!source.includes("jp.rdlabo.workerscapacitor.authentication")) {
            const end = source.lastIndexOf("</dict>");
            source =
              source.slice(0, end) +
              "<key>CFBundleURLTypes</key><array><dict><key>CFBundleURLSchemes</key><array><string>jp.rdlabo.workerscapacitor.authentication</string></array></dict></array>" +
              source.slice(end);
            await writeFile(path, source);
          }
        } else {
          const path = join(shell, "android/app/src/main/AndroidManifest.xml");
          let source = await readFile(path, "utf8");
          if (!source.includes('android:host="oauth"')) {
            source = source.replace(
              "</activity>",
              '<intent-filter><action android:name="android.intent.action.VIEW"/><category android:name="android.intent.category.DEFAULT"/><category android:name="android.intent.category.BROWSABLE"/><data android:scheme="jp.rdlabo.workerscapacitor.authentication" android:host="oauth" android:path="/callback"/></intent-filter></activity>',
            );
            await writeFile(path, source);
          }
        }
      },
      validate: async (backend, platform) => {
        assert.equal(
          backend.reports.find((r) => r.stage === "complete").platform,
          platform,
        );
        assert.equal(
          backend.reports.find((r) => r.stage === "complete").text,
          "Authenticated Worker",
        );
        for (const stage of [
          "system-browser",
          "authorization-code",
          "pkce-exchange",
          "session-created",
          "authenticated-request",
        ])
          assert.ok(
            backend.evidence.some((r) => r.stage === stage),
            stage,
          );
        await writeFile(
          join(
            fileURLToPath(
              new URL(
                "../../artifacts/authentication-native/",
                import.meta.url,
              ),
            ),
            `${platform}-oauth.json`,
          ),
          JSON.stringify(backend.evidence, null, 2),
        );
      },
    });
  },
);
