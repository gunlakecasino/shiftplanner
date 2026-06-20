"use client";

import { useEffect } from "react";

/** Registers the lightweight shell service worker in production only. */
export default function PwaRegister() {
  useEffect(() => {
    // Production-only service worker registration.
    // We deliberately avoid any reference to `process` / process.env in this
    // file to prevent Turbopack module factory errors for the process polyfill
    // (a known issue on simulators and after HMR).
    if (typeof window === 'undefined') return;

    // Heuristic: don't register on localhost in current dev workflow.
    if (location.hostname === 'localhost' || location.hostname.includes('127.0.0.1')) {
      return;
    }

    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}