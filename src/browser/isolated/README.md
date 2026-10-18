# Browser Worker isolation

Dedicated Worker startup, MessageChannel streaming, cancellation and disposal
belong here. This is browser Worker isolation, including Capacitor WebViews,
not Cloudflare Worker deployment or native thread execution.

`src/cloudflare/workers` selects this mechanism when available and coordinates direct
and remote alternatives. The public `browser/isolated` package entry exposes its worker-side transport.
