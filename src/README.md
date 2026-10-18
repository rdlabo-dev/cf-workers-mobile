# Runtime implementation domains

The runtime implementations are the core of this project. Node, browser and
Workers APIs are peer domains directly under `src`, alongside cloud bindings.
Placement does not certify completeness. See each domain's status and evidence.

| Folder                       | Responsibility                                       | Status entry point                                        |
| ---------------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| [compat](compat/README.md)   | Workers-compatible `node:*` modules and Node globals | [Node inventory](../docs/node-compatibility-inventory.md) |
| [browser](browser/README.md) | Browser APIs adapted to Workers behavior             | [Browser API status](browser/README.md)                   |
| [workers](workers/README.md) | Cloudflare-specific runtime modules and APIs         | [Workers status](workers/README.md)                       |
| [shared](shared/README.md)   | Cross-domain installation, codecs and wire helpers   | Internal implementation only                              |

Cloud resource configuration, KV and whole-request remote dispatch live in
[bindings](bindings/README.md). Feature contract/lifecycle infrastructure stays
in `src/features`; fetch interception and isolated execution stay in their runtime
folders. API identity, implementation location and execution policy are separate.
