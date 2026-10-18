# Workers utility adapter

Targets workerd `5358e3d337336eaf696a48bc1563d808b10feba5`, compatibility date
`2026-10-17`, without extra flags. The adjacent contract runs against that
runtime and the browser implementation through the public build integrations.

MIME parsing and parameter iteration follow the pinned C++ implementation,
including first-value retention, snapshot iterators, case-sensitive lookups and
standalone MIMEParams having no backing MIMEType. Formatting, comparison,
callback conversion, styling and abort handling use the corresponding Workers
algorithms. Buffer comparison is resolved at call time to avoid the Buffer/util
initialization cycle.

This module has not passed whole-module acceptance. `getCallSite` and
`getCallSites` are still missing. `types` remains a dependency implementation;
engine-only brands are not certified. Formatting cannot synchronously inspect
Promise state or hidden collection/iterator entries and rejects these operations
explicitly. Proxy inspection cannot avoid user traps. These limitations also
affect assertion diagnostics; ordinary formatting tests do not certify the
engine inspection surface.
