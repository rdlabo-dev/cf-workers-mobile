import { serve } from "@rdlabo/workers-capacitor/worker";
import worker from "../../fixtures/workers/compatibility/fetch";
serve(worker);
