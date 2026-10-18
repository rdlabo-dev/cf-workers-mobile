import { serve } from "@rdlabo/workers-capacitor/worker";
import worker from "../../fixtures/workers/hono/standard";
serve(worker);
