// Regression case: disabling page SSR must not move the D1 loader to the device.
export { loader, action } from "./index.server";
export const ssr = false;
