# Additional compatibility profiles

These adapters target workerd 1.20261012.1, compatibility date 2026-10-17.
`demo/tests/experiments/node-compat/expansion-contracts.probe.mjs` compares the
same operations in workerd, Chromium and WebKit, with both bundlers and both
page and Dedicated Worker execution. The native runner uses an installed npm
package and the same workerd expectations. These operation tests do not certify
whole modules.

Implemented profiles include console's Workers stubs, sys aliasing, public
util/types predicates, crypto random integers/UUIDs/Web Crypto exports,
hash/HKDF/scrypt, the four Workers ECDH curves, crypto engine/secure-heap stubs,
writable memory-backed /tmp, module metadata, HTTP internal
helpers, adapter-owned secret and asymmetric KeyObjects, prime generation and
checking, incremental signatures, Certificate SPKAC operations, Brotli/Zstd codecs and CRC32.
Additional profiles cover process resource/permission/report stubs, its pinned
wall-clock hrtime behavior, and TLS hostname/ALPN/options contracts. Native runs
also test real TLS exchange and hostname mismatch rejection.

The SDK starts a fresh /tmp volume for each local fetch dispatch. Handles opened
inside that request retain their volume; embedded bundle assets stay read-only.
Standalone imports outside SDK dispatch share a fallback volume. Copying embedded files to /tmp preserves immutable embedded bytes. Permission
changes are validated no-ops and statfs returns the pinned Workers zero values.
These checks do not cover every descriptor or cross-volume operation. Watching files is unsupported in Workers too.

Brotli 1.1.0 and Zstd 1.5.7 use bundled, synchronously initialized WebAssembly.
The profile covers parameters, synchronous/callback operations, incremental
streams, flush/reset, byte accounting and output limits for synchronous
processing. Streaming output is not cumulatively capped by maxOutputLength.
The pinned source revisions and artifact hashes accompany the codecs; rebuild
with scripts/build-native-codecs.mjs and the pinned Emscripten SDK. Remaining
codec edge cases and inherited gzip/deflate behavior still require acceptance.
Scrypt uses a synchronous JavaScript backend, including for callback completion,
so large parameters can block the WebView.

Adapter-created secret keys support copied raw/JWK export, equality, generation,
HMAC, HKDF and symmetric ciphers. KeyObject.from can retain a host CryptoKey, but
synchronous extraction of its opaque key material is unavailable. RSA, EC, Ed25519 and X25519 key generation and PEM/DER/JWK conversion use
bundled OpenSSL 3.5.9 WebAssembly; RSA/EC streaming and one-shot signatures
are compared with Workers and independent test signatures. This covers selected
algorithms and operations, not the whole crypto module. X509Certificate,
additional key-generation options and remaining error contracts still need work.
Certificate SPKAC operations preserve the pinned Workers rejection of MD5
signatures while verifying SHA-256 signatures and extracting public keys and
challenges. Invalid SPKAC data returns false or empty buffers, as in Workers.
The pinned revisions and hashes are in crypto/native-crypto.build.json; rebuild
with scripts/build-native-crypto.mjs and the pinned Emscripten SDK. Entropy comes
from the host crypto.getRandomValues; there is no noncryptographic fallback.
Direct Node TLS is implemented and tested through the native transport.
Existing-socket TLS wrapping throws before taking ownership or sending bytes;
actual TLS upgrade and full HTTP internal state contracts remain open.
Consult the generated completion report for remaining work.

Workers reports `fips=true` because of its own crypto backend. The WebView's
JavaScript implementations do not establish FIPS compliance, so that flag is
not copied merely to match the export inventory. `setFips` and `setEngine`
retain Workers' unsupported-operation behavior.
