import { serve } from "workers-capacitor/browser/isolated";
import worker from "../../fixtures/workers/runtime/isolation";
serve(worker);
