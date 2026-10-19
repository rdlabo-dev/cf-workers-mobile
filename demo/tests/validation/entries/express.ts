import { serve } from "workers-capacitor/browser/isolated";
import worker from "../../fixtures/workers/express/standard";
serve(worker);
