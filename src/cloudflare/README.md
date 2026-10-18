# Cloudflare APIs and services

| Folder                           | Responsibility                                                                      | Status                               |
| -------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------ |
| [apis](apis/README.md)           | Cloudflare-owned runtime modules such as `cloudflare:node` and `cloudflare:workers` | Per-API implementation status        |
| [workers](workers/README.md) | Workers handler invocation, direct/Worker/remote selection and lifecycle            | Execution coordination               |
| [bindings](bindings/README.md)   | KV, cloud resource declarations and whole-request remote dispatch                   | Local versus remote execution policy |

An implemented HTTP dispatch path does not implement a cloud service API locally.
Browser API extensions stay with the owning module in `src/browser`. Node.js
compatibility stays in `src/compat`. Workers handler invocation,
execution selection and event ownership live in [workers](workers/README.md).
Browser-specific document hosting and Dedicated Worker transport live in `src/browser`.
