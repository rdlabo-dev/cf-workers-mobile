// on-finished/raw-body explicitly support an absent AsyncResource.
// AsyncLocalStorage and other async_hooks APIs are not supported in this PoC.
export const AsyncResource = undefined;
export default { AsyncResource };
