# Workers TLS context helpers

Ports the pinned workerd 1.20261012.1 `_tls_common` implementation. This module
constructs the Workers placeholder SecureContext and translates legacy peer
certificate objects. It does not configure platform TLS trust or enable the
separate `node:tls` socket module. The adjacent contract compares these helpers
with the actual Workers builtin, including ignored options and error behavior.
