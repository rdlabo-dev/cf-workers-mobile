import { workersCapacitor } from "cf-workers-mobile/capacitor";
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
