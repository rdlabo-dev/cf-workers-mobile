# Cloudflare APIs and services

| Folder                         | Responsibility                                                                      | Status                               |
| ------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------ |
| [apis](apis/README.md)         | Cloudflare-owned runtime modules such as `cloudflare:node` and `cloudflare:workers` | Per-API implementation status        |
| [bindings](bindings/README.md) | KV, cloud resource declarations and whole-request remote dispatch                   | Local versus remote execution policy |

An implemented HTTP dispatch path does not implement a cloud service API locally.
Browser API extensions stay with the owning module in `src/browser`. Node.js
compatibility stays in `src/compat`. Runtime execution and event ownership belong
to `src/runtime`, not to an empty compatibility facade.
