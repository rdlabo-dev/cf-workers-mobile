import { serve } from "cf-workers-native/browser/isolated";
import worker from "../../fixtures/workers/hono/standard";
serve(worker);
