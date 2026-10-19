import { serve } from "@rdlabo/workers-capacitor/browser/isolated";
import worker from "../../fixtures/workers/express/standard";
serve(worker);
