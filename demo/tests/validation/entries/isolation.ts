import { serve } from "@rdlabo/workers-capacitor/worker";
import worker from "../../fixtures/workers/runtime/isolation";
serve(worker);
