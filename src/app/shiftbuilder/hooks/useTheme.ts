"use client";

import { useState, useCallback, useEffect } from "react";

/**
 * Syncs with <html class="dark"> which is set by the no-flash inline script
 * in layout.tsx before hydration. Manual toggle writes to localStorage and
 * also listens for system prefers-color-scheme changes.
 */
export function useTheme() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Read the state the no-flash script already applied
    setIsDark(document.documentElement.classList.contains("dark"));
    // Watch system preference changes — only apply if user hasn't overridden
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem("oms-theme")) {
        document.documentElement.classList.toggle("dark", e.matches);
        setIsDark(e.matches);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("oms-theme", next ? "dark" : "light");
  }, [isDark]);

  return { isDark, toggleTheme };
}
