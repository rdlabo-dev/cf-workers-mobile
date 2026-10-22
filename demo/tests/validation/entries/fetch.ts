import { serve } from "cf-workers-native/browser/isolated";
import worker from "../../fixtures/workers/compatibility/fetch";
serve(worker);
