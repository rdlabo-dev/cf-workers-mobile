# Workers TLS adapter

Adapted from workerd 5358e3d337336eaf696a48bc1563d808b10feba5.
The public tls, \_tls_wrap and \_stream_wrap imports share their constructors.
Certificate hostname checks, ALPN conversion, constants, options validation and
Workers stubs follow the pinned profile. Direct TLS connections use the existing
native socket transport and platform certificate verification. The original
hostname or explicit servername survives DNS resolution and reaches the native
TLS verifier and SNI configuration.

The native expansion suite verifies successful TLS exchange and hostname mismatch
rejection in both page and Dedicated Worker on iOS and Android. Dedicated Workers
use the normal owned socket relay, including disposal. Trust overrides are confined
to the independent debug test consumer and simulator CA store.

Existing native plaintext sockets upgrade on the same TCP connection, preserving
protocol state. iOS uses OpenSSL memory BIOs with mandatory SecTrust chain and
hostname validation; Android uses the existing Netty channel and platform
SSLEngine. Application reads and writes wait for authentication. The native suite
covers TLS 1.2 and 1.3, repeated write-half-close followed by response reads, and
rejection of hostname mismatch and an untrusted root in both execution modes.
Custom Duplex wrapping remains unsupported.

Whole-module acceptance remains open. Further socket lifecycle/prototype and
error-path coverage is also required. Workers itself rejects server mode, custom
verification callbacks, ALPN negotiation options and several introspection APIs
in the pinned profile; retain those explicit failures.
