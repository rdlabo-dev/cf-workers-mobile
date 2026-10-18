const scriptPath = "/capacitor-workers-sw.js";
const disableMessage = "capacitor-workers:disable-documents";

export function isDocumentWorker(worker: ServiceWorker | null): boolean {
  if (!worker) return false;
  const url = new URL(worker.scriptURL);
  return url.origin === location.origin && url.pathname === scriptPath;
}

async function notify(
  worker: ServiceWorker,
  message: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), 2000);
    channel.port1.onmessage = () => finish(true);
    try {
      worker.postMessage(message, [channel.port2]);
    } catch {
      channel.port2.close();
      finish(false);
    }
  });
}
export async function enableDocumentWorker() {
  const controller = navigator.serviceWorker.controller;
  if (
    !isDocumentWorker(controller) ||
    !(await notify(controller!, "capacitor-workers:enable-documents"))
  )
    throw new Error("Document Service Worker did not acknowledge startup");
}

/** Only touch our own transport; the application may have its own SW. */
export async function stopDocumentWorker() {
  if (!globalThis.navigator?.serviceWorker) return;
  const container = navigator.serviceWorker;
  const registrations = (await container.getRegistrations()).filter((entry) => {
    const workers = [entry.active, entry.waiting, entry.installing].filter(
      (worker): worker is ServiceWorker => worker !== null,
    );
    return workers.length > 0 && workers.every(isDocumentWorker);
  });
  const workers = new Set(
    registrations.flatMap((entry) => [
      entry.active,
      entry.waiting,
      entry.installing,
    ]),
  );
  if (isDocumentWorker(container.controller)) workers.add(container.controller);
  // Unregister alone leaves already controlled documents intercepted. Disable
  // dispatch and wait for acknowledgement before completing cleanup.
  const acknowledged = new Set<ServiceWorker>();
  try {
    await Promise.all(
      [...workers].filter(isDocumentWorker).map(async (worker) => {
        if (await notify(worker!, disableMessage)) acknowledged.add(worker!);
      }),
    );
  } finally {
    await Promise.all(registrations.map((entry) => entry.unregister()));
  }
  // Versions predating the disable protocol cannot release an existing client.
  // A fresh document after unregistering drops their controller.
  const controller = container.controller;
  if (isDocumentWorker(controller) && !acknowledged.has(controller!))
    location.reload();
}

export async function registerDocumentWorker(baseURL: string) {
  const container = navigator.serviceWorker;
  const registration = await container.getRegistration("/");
  if (
    registration &&
    [registration.active, registration.waiting, registration.installing].some(
      (worker) => worker && !isDocumentWorker(worker),
    )
  )
    throw new Error(
      "Document rendering conflicts with an application Service Worker",
    );
  return container.register(
    scriptPath + "?baseURL=" + encodeURIComponent(baseURL),
  );
}
