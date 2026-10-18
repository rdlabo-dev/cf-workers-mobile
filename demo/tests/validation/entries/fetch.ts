import { serve } from "@rdlabo/workers-capacitor/browser/isolated";
import worker from "../../fixtures/workers/compatibility/fetch";
serve(worker);
