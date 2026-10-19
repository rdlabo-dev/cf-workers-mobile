import { serve } from "@rdlabo/workers-capacitor/browser/isolated";
import worker from "../../fixtures/workers/runtime/isolation";
serve(worker);
