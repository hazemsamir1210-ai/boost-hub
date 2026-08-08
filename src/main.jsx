import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// The service worker (used for "Add to Home Screen" offline caching) caused
// real problems on some phones, so it's retired. "Add to Home Screen" still
// works fine without it (it only needs manifest.json) — this just makes
// sure anyone with the OLD service worker already installed gets it
// automatically removed.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
  if ("caches" in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
}
