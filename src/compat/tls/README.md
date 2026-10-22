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

Whole-module acceptance remains open. In-place upgrade of an existing plaintext
socket is not implemented by the current native transport; it must not reconnect
and silently discard the protocol state. This is an implementation gap requiring
transport work, not an impossibility claim. Further socket lifecycle/prototype and
error-path coverage is also required. Workers itself rejects server mode, custom
verification callbacks, ALPN negotiation options and several introspection APIs
in the pinned profile; retain those explicit failures.
