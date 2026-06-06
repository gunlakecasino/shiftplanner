"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { reportWebVitals } from "@/lib/perf";
import { getSupabaseRestOrigin, warmSupabaseConnection } from "@/lib/supabase";
import { BuilderDataPrefetch } from "./components/BuilderDataPrefetch";

/**
 * QueryProvider
 *
 * Single QueryClient per browser session + early Supabase connection warm.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  useEffect(() => {
    const origin = getSupabaseRestOrigin();
    if (origin && !document.querySelector(`link[data-supabase-preconnect]`)) {
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = origin;
      link.crossOrigin = "anonymous";
      link.setAttribute("data-supabase-preconnect", "1");
      document.head.appendChild(link);
    }
    void warmSupabaseConnection();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BuilderDataPrefetch />
      {children}
    </QueryClientProvider>
  );
}

if (typeof window !== "undefined") {
  reportWebVitals();
}