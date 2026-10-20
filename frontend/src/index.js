import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import "./mobile/touchAudit";
import { installKeyboardManager } from "./mobile/keyboard";

installKeyboardManager();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
