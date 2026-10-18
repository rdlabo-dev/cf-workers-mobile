# Shared runtime internals

| Folder       | Responsibility                                                                |
| ------------ | ----------------------------------------------------------------------------- |
| `globals/`   | Capture host globals and coordinate installation/ownership across API domains |
| `http-wire/` | HTTP parsing/serialization shared by native Fetch and Node networking         |
| `brotli/`    | Bundled content-decoding implementation and codec asset                       |

These are internal dependencies, not additional public compatibility claims.
API behavior and contracts belong to their owning compat/browser/cloudflare API module.
