# Shared infrastructure

| Folder       | Responsibility                                                                |
| ------------ | ----------------------------------------------------------------------------- |
| `contracts/` | Typed feature definitions, scoped lifecycle and shared contract runner |
| `globals/`   | Capture host globals and coordinate installation/ownership across API domains |
| `http-wire/` | HTTP parsing/serialization shared by native Fetch and Node networking         |
| `brotli/`    | Bundled content-decoding implementation and codec asset                       |

The contract infrastructure is public through `shared/contracts` and
`shared/contracts/testing`; the other helpers are internal dependencies.
Sharing infrastructure does not establish additional API compatibility.
API behavior and contracts belong to their owning compat/browser/cloudflare API module.
