import { workersCapacitor } from "@rdlabo/workers-capacitor";
import {
  enableDocumentWorker,
  registerDocumentWorker,
  stopDocumentWorker,
} from "../../../../../src/runtime/documents/registration";
Object.assign(window, {
  documentLifecycle: {
    workersCapacitor,
    enableDocumentWorker,
    registerDocumentWorker,
    stopDocumentWorker,
  },
});
