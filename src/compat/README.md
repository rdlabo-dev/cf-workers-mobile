# Runtime compatibility domains

This directory contains local runtime compatibility, grouped by API origin.
Placement does not certify completeness. See each domain's status and evidence.

| Folder                       | Responsibility                                       | Status entry point                                           |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| [node](node/README.md)       | Workers-compatible `node:*` modules and Node globals | [Node inventory](../../docs/node-compatibility-inventory.md) |
| [web](web/README.md)         | Web-standard APIs adapted to Workers behavior        | [Web status](web/README.md)                                  |
| [workers](workers/README.md) | Cloudflare-specific runtime modules and APIs         | [Workers status](workers/README.md)                          |
| [shared](shared/README.md)   | Cross-domain installation, codecs and wire helpers   | Internal implementation only                                 |

Cloud resource configuration, KV and whole-request remote dispatch live in
[bindings](../bindings/README.md). Feature contract/lifecycle infrastructure stays
in `src/features`; fetch interception and isolated execution stay in their runtime
folders. API identity, implementation location and execution policy are separate.
