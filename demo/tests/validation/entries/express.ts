import { serve } from "@rdlabo/workers-capacitor/worker";
import worker from "../../fixtures/workers/express/standard";
serve(worker);
