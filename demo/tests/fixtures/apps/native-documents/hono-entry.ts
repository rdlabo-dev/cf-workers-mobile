import { serve } from "@rdlabo/workers-capacitor/worker";
import worker from "../../workers/rendering/hono";
serve(worker);
