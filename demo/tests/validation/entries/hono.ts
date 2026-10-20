import { serve } from "cf-workers-mobile/browser/isolated";
import worker from "../../fixtures/workers/hono/standard";
serve(worker);
