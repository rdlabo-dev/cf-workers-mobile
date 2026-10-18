import { capacitorWorkers } from "@rdlabo/capacitor-workers";
import { Capacitor } from "@capacitor/core";
import server from "./server.json";
const origin = `https://${Capacitor.getPlatform() === "android" || globalThis.CapacitorWorkersHost ? "10.0.2.2" : "127.0.0.1"}:${server.port}`;
const runtime = capacitorWorkers({
  baseURL: "https://existing-worker.invalid/",
  render: "/ui/account",
  remote: { origin },
});
runtime.ready.catch((error) => {
  document.body.textContent = String(error);
  console.error(error);
});
