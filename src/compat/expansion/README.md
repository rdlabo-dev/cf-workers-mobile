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
checking, incremental signatures, Certificate SPKAC and X509Certificate operations,
zlib/Brotli/Zstd codecs and CRC32, and cipher metadata lookup.
Additional profiles cover process resource/permission/report stubs, its pinned
wall-clock hrtime behavior, and TLS hostname/ALPN/options contracts. Native runs
also test real TLS exchange and hostname mismatch rejection.

The SDK starts a fresh /tmp volume for each local fetch dispatch. Handles opened
inside that request retain their volume; embedded bundle assets stay read-only.
Standalone imports outside SDK dispatch share a fallback volume. Copying embedded files to /tmp preserves immutable embedded bytes. Permission
changes are validated no-ops and statfs returns the pinned Workers zero values.
Embedded files support read-only descriptors, FileHandles, streams and links; copies into /tmp are writable and independent. Numeric file timestamps use milliseconds; embedded timestamps remain unchanged. Watching files is unsupported in Workers too. These profiles do not certify every filesystem operation.

zlib 1.3.1, Brotli 1.1.0 and Zstd 1.5.7 use bundled, synchronously initialized WebAssembly.
The profile covers parameters, synchronous/callback operations, incremental
streams, flush/reset, byte accounting and output limits for synchronous
processing. Streaming output is not cumulatively capped by maxOutputLength.
The pinned source revisions and artifact hashes accompany the codecs; rebuild
with scripts/build-native-codecs.mjs or scripts/build-native-zlib.mjs and the pinned Emscripten SDK. Gzip/deflate and Brotli/Zstd streams use the pinned Workers stream lifecycle. The comparative cases include constructor validation, callback timing, reset, close, byte accounting, dictionaries and output limits; whole-module acceptance remains a separate gate.
Scrypt uses a synchronous JavaScript backend, including for callback completion,
so large parameters can block the WebView.

Adapter-created secret keys support copied raw/JWK export, equality, generation,
HMAC, HKDF and symmetric ciphers. KeyObject.from can retain a host CryptoKey, but
synchronous extraction of its opaque key material is unavailable. RSA, EC, Ed25519 and X25519 key generation and PEM/DER/JWK conversion use
bundled OpenSSL 3.5.9 WebAssembly; RSA/EC streaming and one-shot signatures
are compared with Workers and independent test signatures. This covers selected
algorithms and operations, not the whole crypto module. Additional key-generation
options and remaining error contracts still need work. `getCipherInfo` returns pinned Workers metadata; a successful lookup does not establish local availability of the named encryption algorithm.
X509Certificate parses PEM/DER, exposes certificate fields and legacy objects,
extracts RSA/EC public keys, checks names and issuers, and verifies signatures
with certificate public keys. The pinned Workers runtime returns false for
matching imported/generated private keys and public keys used by these X509
checks; the adapter preserves this conservative result. It also preserves the
pinned runtime's refusal to match partial or multiple DNS labels with a wildcard,
and its ignored subject-always/single-label-subdomain options. These are Workers profile limits, not Node
semantics or a claim that the keys do not match.
Certificate SPKAC operations preserve the pinned Workers rejection of MD5
signatures while verifying SHA-256 signatures and extracting public keys and
challenges. Invalid SPKAC data returns false or empty buffers, as in Workers.
The pinned revisions and hashes are in crypto/native-crypto.build.json; rebuild
with scripts/build-native-crypto.mjs and the pinned Emscripten SDK. Entropy comes
from the host crypto.getRandomValues; there is no noncryptographic fallback.
Direct Node TLS is implemented and tested through the native transport.
Existing native sockets can upgrade on the same TCP connection. Application
writes wait for authenticated TLS; hostname mismatch or cancellation closes
the connection without sending queued application bytes. Native acceptance
exchanges a plaintext upgrade command followed by TLS, checks connection counts
and tests page and Dedicated Worker modes on both OSes. Custom Duplex wrapping
is unsupported. iOS upgrades use the existing OpenSSL Wasm backend with memory
BIOs on the original TCP connection; SecTrust must authenticate the peer chain
and hostname before the connection opens or application data is exposed. Android
uses the existing Netty channel with the platform SSLEngine. Native tests cover
TLS 1.2 and 1.3, including repeated write-half-close followed by response reads.
Full TLS class and
HTTP internal state contracts remain open.
Consult the generated completion report for remaining work.

Workers reports `fips=true` because of its own crypto backend. The WebView's
JavaScript implementations do not establish FIPS compliance, so that flag is
not copied merely to match the export inventory. `setFips` and `setEngine`
retain Workers' unsupported-operation behavior.
