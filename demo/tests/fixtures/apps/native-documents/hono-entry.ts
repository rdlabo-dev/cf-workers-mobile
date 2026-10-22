import { serve } from "cf-workers-native/browser/isolated";
import worker from "../../workers/rendering/hono";
serve(worker);
