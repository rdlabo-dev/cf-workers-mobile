# pknotes acceptance and native authentication limit

`upstream.json` pins the MIT-licensed [pknotes](https://github.com/ddyy/pknotes) application. Preparation uses its npm lockfile and normal build without application source edits. The original Worker runs in local workerd with disposable D1, real rate-limit bindings and a fixture-only session secret.

The Chromium scenario uses a CDP virtual CTAP2 authenticator with the PRF extension. It registers through the original UI, creates and saves a note, checks that D1 stores ciphertext, reloads, unlocks with the same passkey and checks the decrypted note. This exercises real WebAuthn assertions and application encryption, but does not test a physical authenticator or iCloud/Google passkey synchronization.

Native acceptance is **incomplete**. Set `PKNOTES_TRUSTED_TAP=1` for a manual native button tap; the diagnostic records and asserts the click's `isTrusted` flag. The default native diagnostic uses a programmatic form submission and records a failed registration and verifies that no account was created. Android reports an unavailable Web Authentication service; iOS reports cancellation or timeout. The iOS result alone does not establish that passkeys are technically impossible. Trusted taps on both the iOS simulator and Android emulator reproduce the same errors. These are rejection/diagnostic checks, not successful native account or note acceptance tests.

Displaying remote HTML does not move the document's origin to the deployed Worker's origin. WebAuthn requires a suitable relying-party origin and native platform configuration. See [Android's Credential Manager WebView integration](https://developer.android.com/identity/sign-in/credential-manager-webview) and [Apple's associated-domain configuration](https://developer.apple.com/documentation/xcode/supporting-associated-domains). Production domain association, native credential integration, trusted user interaction and PRF availability require separate validation; the adapter does not bypass these checks.

```sh
node demo/tests/upstream/pknotes/prepare.mjs
node --test demo/tests/upstream/pknotes/browser.test.mjs
UPSTREAM_PLATFORM=ios UPSTREAM_DEVICE=<simulator-udid> node --test demo/tests/upstream/pknotes/native.test.mjs
UPSTREAM_PLATFORM=android UPSTREAM_DEVICE=<emulator-id> node --test demo/tests/upstream/pknotes/native.test.mjs
```

Install root/demo dependencies and build the library first; native tests also need `demo/opennext` dependencies. Run native tests serially. They reset the test app's data and use local HTTPS/workerd, not a production deployment. The native fixture injects its UI driver without changing upstream source.
