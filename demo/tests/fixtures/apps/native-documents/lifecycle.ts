import { workersCapacitor } from "workers-capacitor";
import {
  enableDocumentWorker,
  registerDocumentWorker,
  stopDocumentWorker,
} from "../../../../../src/browser/documents/registration";
Object.assign(window, {
  documentLifecycle: {
    workersCapacitor,
    enableDocumentWorker,
    registerDocumentWorker,
    stopDocumentWorker,
  },
});
