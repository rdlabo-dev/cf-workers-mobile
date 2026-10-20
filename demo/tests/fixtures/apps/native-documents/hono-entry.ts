import { serve } from "cf-workers-mobile/browser/isolated";
import worker from "../../workers/rendering/hono";
serve(worker);
