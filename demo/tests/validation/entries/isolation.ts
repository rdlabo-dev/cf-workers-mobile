import { serve } from "cf-workers-native/browser/isolated";
import worker from "../../fixtures/workers/runtime/isolation";
serve(worker);
