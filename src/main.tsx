// Deve restare la PRIMA import: installa il fallback storage in memoria prima
// che il client Supabase tocchi localStorage (pagina nera su mobile/privato).
import "./lib/safeStorage";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
