import { serve } from "cf-workers-mobile/browser/isolated";
import worker from "../../fixtures/workers/compatibility/fetch";
serve(worker);
