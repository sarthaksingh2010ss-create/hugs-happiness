import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./lib/device-powers";

createRoot(document.getElementById("root")!).render(<App />);
