import { serve } from "workers-capacitor/browser/isolated";
import worker from "../../fixtures/workers/hono/standard";
serve(worker);
