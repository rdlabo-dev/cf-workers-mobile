import { serve } from "@rdlabo/workers-capacitor/worker";
import worker from "../../workers/rendering/express";
serve(worker);
