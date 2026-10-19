import { serve } from "workers-capacitor/browser/isolated";
import worker from "../../workers/rendering/hono";
serve(worker);
