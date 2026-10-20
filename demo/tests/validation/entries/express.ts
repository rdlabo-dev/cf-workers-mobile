import { serve } from "cf-workers-mobile/browser/isolated";
import worker from "../../fixtures/workers/express/standard";
serve(worker);
