import React from "react";
import { createRoot } from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  // Groundstation effects own explicit IPC terminal subscriptions. React's
  // development-only StrictMode remount would open a second stream before the
  // asynchronous close request from the first mount reaches the main process.
  <App />
);
