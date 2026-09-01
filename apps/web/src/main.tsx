import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import { environment } from "./config/environment.js";
import "./styles/global.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element was not found");
}

document.title = environment.shopName;

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
