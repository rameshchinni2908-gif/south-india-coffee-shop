import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import { environment } from "./config/environment.js";
import { prefetchMenu } from "./features/menu/menu-query-options.js";
import { queryClient } from "./lib/query-client.js";
import "./styles/global.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element was not found");
}

document.title = environment.shopName;
prefetchMenu(queryClient, window.location);

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
