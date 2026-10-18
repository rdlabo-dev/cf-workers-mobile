import { readDocumentBody, encodeDocumentBytes } from "./body.js";
import { isDocumentURL } from "./page-config.js";
// Only multipart POSTs need this iOS workaround. Serialize before starting a
// native URLRequest navigation, so the submitting Window cannot disappear while
// file bytes are being read. The result is still a new top-level document.
function destination(form: HTMLFormElement, button: HTMLElement | null) {
  const method = (
    button?.getAttribute("formmethod") ?? form.method
  ).toLowerCase();
  const enctype = button?.getAttribute("formenctype") ?? form.enctype;
  const target = button?.getAttribute("formtarget") ?? form.target;
  const action =
    button?.getAttribute("formaction") ?? form.getAttribute("action");
  const url = new URL(action || location.href, document.baseURI);
  if (
    method !== "post" ||
    enctype !== "multipart/form-data" ||
    (target && target !== "_self") ||
    url.protocol !== location.protocol ||
    url.host !== location.host ||
    !isDocumentURL(url)
  )
    return;
  return url;
}
async function navigate(
  form: HTMLFormElement,
  button: HTMLElement | null,
  url: URL,
) {
  // Includes successful controls, the actual submitter, and application changes
  // made during the synchronous formdata event.
  const request = new Request(url, {
    method: "POST",
    body: new FormData(form, button),
  });
  const bytes = new Uint8Array(await readDocumentBody(request));
  await (
    window as typeof window & {
      webkit: {
        messageHandlers: {
          documentFetch: { postMessage(value: unknown): Promise<unknown> };
        };
      };
    }
  ).webkit.messageHandlers.documentFetch.postMessage({
    formNavigate: {
      url: url.href,
      headers: Object.fromEntries(request.headers),
      body: encodeDocumentBytes(bytes),
    },
  });
}
window.addEventListener("submit", (event) => {
  // Native validation already ran. Form/document handlers can cancel first.
  if (event.defaultPrevented || !(event.target instanceof HTMLFormElement))
    return;
  const url = destination(event.target, event.submitter);
  if (!url) return;
  event.preventDefault();
  void navigate(event.target, event.submitter, url).catch((error) =>
    window.reportError(error),
  );
});
const submit = HTMLFormElement.prototype.submit;
HTMLFormElement.prototype.submit = function () {
  const url = destination(this, null);
  if (!url) return submit.call(this);
  // Direct submit intentionally bypasses validation and the submit event.
  void navigate(this, null, url).catch((error) => window.reportError(error));
};
