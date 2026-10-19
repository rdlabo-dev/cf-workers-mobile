import { documentConfig } from "./page-config.js";
// A window click listener runs after framework handlers on roots and document.
// Preserve handled clicks, downloads, other browsing contexts and external links.
if (window === window.top)
  window.addEventListener("click", (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link =
      event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download"))
      return;
    const target =
      link.target ||
      document.querySelector("base[target]")?.getAttribute("target");
    if (target && target.toLowerCase() !== "_self") return;
    const url = new URL(link.href);
    if (
      url.origin !== documentConfig.baseURL ||
      url.username ||
      url.password ||
      (url.protocol === location.protocol && url.host === location.host)
    )
      return;
    event.preventDefault();
    location.assign(
      location.protocol +
        "//" +
        location.host +
        url.pathname +
        url.search +
        url.hash,
    );
  });
