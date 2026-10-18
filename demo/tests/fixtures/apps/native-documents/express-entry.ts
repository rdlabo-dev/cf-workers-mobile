import { serve } from "@rdlabo/workers-capacitor/browser/isolated";
import worker from "../../workers/rendering/express";
serve(worker);
