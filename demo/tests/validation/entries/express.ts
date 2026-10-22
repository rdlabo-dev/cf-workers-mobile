import { serve } from "cf-workers-native/browser/isolated";
import worker from "../../fixtures/workers/express/standard";
serve(worker);
