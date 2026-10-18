The hook stubs in hooks.ts and API behavior in index.ts are adapted from
Cloudflare workerd revision 5358e3d337336eaf696a48bc1563d808b10feba5:
src/node/async_hooks.ts and src/workerd/api/node/async-hooks.{h,c++}.
Copyright (c) 2017-2022 Cloudflare, Inc. Licensed under Apache-2.0.

The JavaScript context propagation implementation is repository code. It cannot
observe native Promise continuation frames and is not equivalent to workerd's
engine-level context tracking.
