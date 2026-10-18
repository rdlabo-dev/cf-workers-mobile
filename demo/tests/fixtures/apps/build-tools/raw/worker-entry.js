import { serve } from "./lib/browser/isolated/transport.js";
import worker from "./worker.js";
serve(worker);
