"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * QueryProvider
 *
 * This sets up TanStack Query (React Query) for the Shift Builder section.
 *
 * Why this pattern?
 * - We create the QueryClient inside a client component using useState.
 * - This guarantees a single QueryClient instance per browser session.
 * - It avoids the common mistake of creating a new QueryClient on every render.
 *
 * This is the recommended way in Next.js App Router + React 19.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Good defaults for an internal tool
            staleTime: 1000 * 60 * 5, // 5 minutes
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
